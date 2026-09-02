//Model has no awareness of HTML elements (with an exception for throbbers; I accept this for now)
//TODO target should have a function or parameter with acccess to 'model'

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

    async loadPbs(user_id, pool_id) {

        return await apiAction({
            body: JSON.stringify({
                endpoint: 'pbs',
                paginate: true,
                use_cache: false,
                params: {
                    user_id: user_id,
                    collection_id: pool_id
                }
            })
        })
            .then(async data => {
                this.pbs[username] ||= {};
                this.pbs[username][pool_id] = data["data"];
                return this.pbs[username][pool_id];
            })
    }

    userIdFromName(username) {
        return this.players.find(player => player.name === username)["id"];
    }
}

const asStandard = (type) => `standard-${type}`;

export class Focus {

    constructor(user_id, collection_id, track_id, category_id, engine_id) {
        this.user_id = user_id;
        this.collection_id = collection_id;
        this.track_id = track_id;
        this.category_id = category_id;
        this.engine_id = engine_id;
    }

}

function intersectionAlongParameter(set1, set2, parameter) {
    return set1.filter(item => set2.some(item2 => item[parameter] === item2[parameter]));
}

function matchingAll(set, item, parameters) {
    parameters.forEach(parameter => {
        set = set.filter(setItem => setItem[parameter] === item[parameter]);
    })
    return set;
}

function first(container) {
    if (container.length > 0) {
        return container[0];
    } else {
        return null;
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

        if (focus.collection_id !== null && focus.collection_id !== 1) { //TODO only Saphi works rn
            return null;
        }

        let user_pbs = await this.model.loadPbs(focus.user_id, 1);

        if (this.type === 'user') {
            //return the simple matchup preview

            let target_pbs = await this.model.loadPbs(this.model.userIdFromName(this.value), 1);

            return Totals.matchup(user_pbs, target_pbs, `vs ${this.value}`, (entry, target_time) => {
                return entry.time < target_time || (ties_are_wins && entry.time === target_time);
            });
        }

        if (this.type === 'rank') {
            return Totals.matchingRule(user_pbs, `rank ${this.value}`, (entry) => {
                return entry.rank >= this.value; //ties are always wins
            })
        }

        if (this.type === 'standard') {
            return Totals.matchingRule(user_pbs, `standard-${this.value}`, (entry) => {
                return entry.standard_id <= this.value; //ties are never wins
            })
        }

        if (this.type === 'percentile') {
            return Totals.matchingRule(user_pbs, `${this.value} %ile`, (entry) => {
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