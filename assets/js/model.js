//Model has no awareness of HTML elements (with an exception for throbbers; I accept this for now)
//TODO target should have a function or parameter with acccess to 'model'

const API_URL = import.meta.env.VITE_API_URL;

export class Model {

    constructor() {
        this.tracks = [];
        this.players = [];
        this.standards = [];
        this.ctr4ever = {}; //ctr4ever records
        this.leaderboards = {}; //cache of records; currently unused
        this.track_priorities = {}; //includes a difference and a tier, which can independently be used to determine priority; currently unused
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
}

const asStandard = (type) => `standard-${type}`;

export class Target {
    constructor(type, value, model) {
        this.type = type;
        this.value = value;
        this.model = model;
    }

    getMatchingEntry(entries, context) {
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
            if (context.track_id) {
                const track = this.model.tracks.find(track => track.id === context.track_id);
                const match = track?.standards
                    .filter(standard => standard.category_id === context.category_id)
                    .find(standard => standard.tier_id === parseInt(this.value))
                if (match) syntheticEntry.time_formatted = match.time_formatted;
            }
            return syntheticEntry;
        }
        if (this.type === 'ctr4ever') {
            return this.model.ctr4ever[context.track_id][context.category_id].find(entry => entry.name === this.value);
        }
        if (this.type === 'user') {
            return entries.find(entry => entry.name === this.value);
        }
    }

    async totals(username, ties_are_wins=false) {

        if (this.type === '') {
            return null;
        }

        if (this.type === 'user') {
            //return the simple matchup preview
            return await apiAction({
                method: 'POST',
                body: JSON.stringify({
                    endpoint: 'matchups',
                    paginate: true,
                    max_age: 3600,
                    params: {
                        player1_id: this.model.players.find(player => player.name === username)["id"],
                        player2_id: this.model.players.find(player => player.name === this.value)["id"]
                    }
                })
            })
                .then((json) => {
                    let data = json["data"][0];
                    const courses = data.comparisons.filter(c => c["category_id"] === 1);
                    const laps = data.comparisons.filter(c => c["category_id"] === 2);
                    const courses_won = courses.filter(c => c["winner"] === 1);
                    const laps_won = laps.filter(c => c["winner"] === 1);
                    console.log(courses, laps);
                    return {
                        courses_won: courses_won.length,
                        courses_total: courses.length,
                        laps_won: laps_won.length,
                        laps_total: laps.length,
                        label: `vs ${this.value}`
                    }
                })
        }

        if (this.type === 'rank') {

        }

        if (this.type === 'standard') {

        }

        if (this.type === 'percentile') {

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