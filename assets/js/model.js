//Model has no awareness of HTML elements (with an exception for throbbers; I accept this for now)
//TODO target should have a function or parameter with acccess to 'model'

import {first, intersectionAlongParameter, matchingAll} from "./utils";

const API_URL = import.meta.env.VITE_API_URL;

export class Model {

    constructor() {
        this.tracks = [];
        this.players = [];
        this.standards = [];
        this.pbs = {};
        this.ctr4ever = {}; //ctr4ever records
        this.leaderboards = {}; //cache of records; currently unused
    }

    //do the things

    async loadLeaderboard(track_id, category_id, target) {
        return await apiAction({
            body: JSON.stringify({
                endpoint: 'leaderboards',
                paginate: true,
                max_age: 3600,
                params: {
                    track_id: track_id,
                    category_id: category_id
                }
            })
        }).then(async data => {
            if (target.type === 'ctr4ever') {
                await apiAction({
                    body: JSON.stringify({
                        endpoint: 'ctr4ever',
                        params: {
                            track: this.tracks.find(track => track['id'] === track_id)['name'],
                            category: category_id === 1 ? 'course' : 'lap'
                        }
                    })
                })
                    .then(async data => {
                        this.ctr4ever[track_id] ||= {};
                        this.ctr4ever[track_id][category_id] = data["data"];
                    })
            }
            return data;
        }).then(async data => {
            this.leaderboards[track_id] ||= {};
            this.leaderboards[track_id][category_id] = data["data"];
            return this.leaderboards[track_id][category_id];
        });
    }

    async loadStandards() {

        return await apiAction({
            body: JSON.stringify({
                endpoint: 'standards',
                paginate: true,
                max_age: 3600
            })
        })
            .then(data => {
                this.standards = data["data"].reverse();

                return this.standards;
            });

    }

    async loadPlayers() {

        return await apiAction({
            body: JSON.stringify({
                endpoint: 'players',
                paginate: true,
                max_age: 3600,
            })
        })
            .then(data => {
                this.players = data["data"];

                return this.players;
                //internal use; no fields are affected
            })
    }

    async loadTracks() {

        return await apiAction({
            body: JSON.stringify({
                endpoint: 'tracks',
                paginate: true,
                max_age: 3600,
                params: {
                    include_downloads: false
                }
            })
        })
            .then(data => {
                this.tracks = data["data"];

                return this.tracks;
            })
    }

    async loadPbs(user_id, scope=null) {

        if (scope === null) {
            await this.loadPbs(user_id, "saphi");
            await this.loadPbs(user_id, "community");
            await this.loadPbs(user_id, "original");

            return this.pbs[user_id].flat();
        }

        return await apiAction({
            body: JSON.stringify({
                endpoint: 'pbs',
                paginate: true,
                use_cache: false,
                params: {
                    user_id: user_id,
                    scope: scope
                }
            })
        })
            .then(async data => {
                this.pbs[user_id] ||= {};
                this.pbs[user_id][scope] = data["data"];
                return this.pbs[user_id][scope];
            })
    }

    userIdFromName(username) {
        return this.players.find(player => player.name === username)["id"];
    }

    getStandard(standard_id) {
        return this.standards.find(standard => standard.id === standard_id);
    }
}

const asStandard = (type) => `standard-${type}`;

export class Focus {

    constructor(user_id, scope, track_id, category_id, engine_id) {
        this.user_id = user_id;
        this.scope = scope;
        this.track_id = track_id;
        this.category_id = category_id;
        this.engine_id = engine_id;
    }

}

export class Totals {

    constructor(label, courses_won, courses_total, laps_won, laps_total) {
        this.label = label;
        this.courses_won = courses_won;
        this.courses_total = courses_total;
        this.laps_won = laps_won;
        this.laps_total = laps_total;
    }

    static matchup(pbs, target_pbs, label, rule) {

        const courses = intersectionAlongParameter(pbs, target_pbs, "track_id").filter(c => c["category_id"] === 1);
        const laps = intersectionAlongParameter(pbs, target_pbs, "track_id").filter(c => c["category_id"] === 2);
        console.log(courses, laps, target_pbs);
        const courses_won = courses
            .filter(c => rule(c,
                first(matchingAll(target_pbs, c, ["track_id", "category_id"]))["time"]));
        const laps_won = laps
            .filter(c => rule(c,
                first(matchingAll(target_pbs, c, ["track_id", "category_id"]))["time"]));
        return new Totals(label, courses_won.length, courses.length, laps_won.length, laps.length)
    }

    static matchingRule(pbs, label, rule) {
        const courses = pbs.filter(pb => pb["category_id"] === 1);
        const laps = pbs.filter(pb => pb["category_id"] === 2);
        console.log(pbs);
        const courses_won = courses.filter(rule);
        const laps_won = laps.filter(rule);
        return new Totals(label, courses_won.length, courses.length, laps_won.length, laps.length);
    }
}

export class Target {
    constructor(type, value, model) {
        this.type = type;
        this.value = value;
        this.model = model;
        this.track_difference = {}; //how far you are from achieving the target, per focus
    }

    getMatchingEntry(entries, focus) {
        if (this.type === '') {
            return null;
        }
        if (this.type === 'user') {
            return entries.find(entry => entry.name === this.value);
        }
        if (this.type === 'rank') {
            return entries.find(entry => entry.rank === parseInt(this.value));
        }
        if (this.type === 'percentile') {
            const candidates = entries
                .filter(entry => entry.percentile >= parseInt(this.value))  // must be at least the target percentile

            return candidates.length > 0
                ? candidates.reduce((a, b) => a.percentile < b.percentile ? a : b)  // get the lowest percentile
                : null;  // if there are no submissions, return none
        }
        if (this.type === 'standard') {
            const syntheticEntry = {
                time_formatted: '0:00.00',
                name: asStandard(this.value)
            }
            if (focus.track_id) {
                const track = this.model.tracks.find(track => track.id === focus.track_id);
                const match = track?.standards
                    .filter(standard => standard.category_id === focus.category_id)
                    .find(standard => standard.tier_id === parseInt(this.value))
                if (match) syntheticEntry.time_formatted = match.time_formatted;
            }
            return syntheticEntry;
        }
        if (this.type === 'ctr4ever') {
            return this.model.ctr4ever[focus.track_id][focus.category_id].find(entry => entry.name === this.value);
        }
        if (this.type === 'user') {
            return entries.find(entry => entry.name === this.value);
        }
    }

    async totals(focus, ties_are_wins=false) {

        if (this.type === '') {
            return null;
        }

        let user_pbs = await this.model.loadPbs(focus.user_id, focus.scope);

        if (this.type === 'user' && this.value) {
            //return the simple matchup preview

            let target_pbs = await this.model.loadPbs(this.model.userIdFromName(this.value), focus.scope);

            return Totals.matchup(user_pbs, target_pbs, `vs ${this.value}`, (entry, target_time) => {
                return entry.time < target_time || (ties_are_wins && entry.time === target_time);
            });
        }

        if (this.type === 'rank' && this.value) {
            return Totals.matchingRule(user_pbs, `rank ${this.value}`, (entry) => {
                return entry.rank <= this.value; //ties are always wins
            })
        }

        if (this.type === 'standard' && this.value) {
            return Totals.matchingRule(user_pbs, `${this.model.getStandard(parseInt(this.value))["name"]} times`, (entry) => {
                return entry.standard_id && entry.standard_id <= this.value; //ties are never wins
            })
        }

        if (this.type === 'percentile' && this.value) {
            return Totals.matchingRule(user_pbs, `%ile of ${this.value}`, (entry) => {
                return entry.percentile > this.value || (ties_are_wins && entry.percentile === this.value);
            })
        }

        return null;

    }

    label(match) {
        if (match) {
            return match.name;
        } else {
            return 'Target';
        }
    }
}

async function apiAction(json) {
    document.body.classList.add('is-loading');
    try {
        const myHeaders = new Headers();
        myHeaders.append("Content-Type", "application/json");

        return await fetch(API_URL + "/webhook", {
            ...json,
            headers: myHeaders,
            method: 'POST'
        })
            .then(r => r.json())
    } catch (e) {
        console.error(e);
    } finally {
        document.body.classList.remove('is-loading');  // reverts to default/inherited behavior
    }
}