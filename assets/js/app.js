/*
 DROP-IN* NOTES
 -------------
 Open this file directly in a browser to preview it, or point an OBS
 Browser Source at it (Properties > Local File, or host it and use
 the URL). The page background is transparent outside the panel, so
 it composites cleanly over gameplay capture.

 To wire in real data, call render(data) whenever your polling
 script or websocket delivers a new state. Expected shape:

 {
  session: { bestTime: "1:12.44", attempts: 14 } | null,
  goal: { time: "1:04.22", type: "BIC" | "WR" | "2nd place" | string } | null,
  pb: "1:12.44" | null,
  factoid: "First attempt on this track: 1:45.90"
 }

 Seconds-to-goal is NOT passed in -- it's computed here from pb vs
 goal.time. "Achieved" means pb is equal to or faster than goal.time
 (handles the WR / 2nd-place cases too: being ahead of 2nd place is
 the same shape as beating a standard).

 Example websocket wiring:
 const ws = new WebSocket("ws://localhost:8080");
 ws.onmessage = (e) => render(JSON.parse(e.data));

 Example polling wiring:
 setInterval(async () => {
 const data = await (await fetch("/state.json")).json();
 render(data);
 }, 1000);

 Delete the demo cycle at the bottom once real data is wired in.
*/

import { init as initVoronoi } from '@hyreon/voronoi';
import { init as initAiBadge } from '@hyreon/ai-badge';
import { isValidTime, parseTime, formatTimeMask } from './utils';

initVoronoi([
    [15,60,90],
    [10,15,35],
    [20,80,100],
    [12,12,30],
    [10,50,75],
    [15,18,40],
    [25,70,85]
]);
initAiBadge();

const API_URL = import.meta.env.VITE_API_URL;

let tracks = [];
let players = [];
let standards = [];
let ctr4ever = {}; //ctr4ever records
let records = {}; //cache of records, currently unused
let track_priorities = {}; //includes a difference and a tier, which can independently be used to determine priority

window.addEventListener("gamepadconnected", (event) => {
    console.log("Gamepad connected:", event.gamepad.id);
    pollGamepad()
});

window.addEventListener("gamepaddisconnected", (event) => {
    console.log("Gamepad disconnected:", event.gamepad.id);
});

let boundButtonIndex = null;

const rebindButton = document.getElementById("rebind-button");

function bindButton(index) {
  boundButtonIndex = index;
  rebindButton.textContent = "Rebind";
}

function unbindButton() {
  boundButtonIndex = null;
  previousButtonState = false;
  rebindButton.textContent = "Press a button...";

  requestAnimationFrame(pollGamepad);
}

rebindButton.addEventListener("click", unbindButton);

let previousButtonState = false;
function pollGamepad() {
    const gamepads = navigator.getGamepads();
    const gp = gamepads[0]; // adjust if you support multiple controllers

    if (gp && boundButtonIndex !== null) {
        const currentState = gp.buttons[boundButtonIndex].pressed;

        if (currentState && !previousButtonState) {
            incrementAttempt();
        }

        previousButtonState = currentState;
    } else if (boundButtonIndex === null) {
        let pressedButtonIndex = gp.buttons.findIndex((button) => button.pressed);
        if (pressedButtonIndex !== -1) {
            bindButton(pressedButtonIndex);
        }
    }

    requestAnimationFrame(pollGamepad);
}

function incrementAttempt() {
    const attemptEl = document.getElementById('attempt-set');
    attemptEl.value = parseInt(attemptEl.value || '0') + 1;
    manualRender(); // or whatever re-renders after a manual field change
}

function getRankString(num) {
    const absNum = Math.abs(Math.trunc(num));
    const lastTwo = absNum % 100;

    if (lastTwo >= 11 && lastTwo <= 13) {
        return `${num}th`;
    }

    switch (absNum % 10) {
        case 1:
            return `${num}st`;
        case 2:
            return `${num}nd`;
        case 3:
            return `${num}rd`;
        default:
            return `${num}th`;
    }
}

function render(data) {
    var sessionMain = document.getElementById('session-main');
    var sessionSub = document.getElementById('session-sub');
    if (!data.session) {
        sessionMain.className = 'main placeholder';
        sessionMain.textContent = 'No runs yet';
        sessionSub.textContent = '';
    } else {
        sessionMain.className = 'main';
        sessionMain.textContent = data.session.bestTime;
        sessionSub.textContent = data.session.attempts + ' attempts this session';
    }

    var goalLabel = document.getElementById('goal-label');
    var goalImage = document.getElementById('goal-image');
    var goalReason = document.getElementById('goal-reason');
    var goalMain = document.getElementById('goal-main');
    var goalSub = document.getElementById('goal-sub');
    if (!data.goal) {
        goalLabel.textContent = 'Goal';
        goalMain.className = 'main placeholder';
        goalMain.textContent = 'No goal set';
        goalSub.textContent = '';
    } else {
        if (data.goal.type.startsWith("standard-")) {
            goalImage.className = "eyebrow standard-icon-sprite " + data.goal.type;
            goalLabel.textContent = ""
        } else {
            goalImage.className = ""
            goalLabel.textContent = data.goal.type;
        }
        goalMain.className = 'main tier';
        goalMain.textContent = data.goal.time;
        if (!data.pb) {
            goalSub.textContent = 'No PB yet';
            goalSub.style.color = '#aaaaaa';
        } else {
            let diff = 0;
            if (data.goal.time) {
                diff = parseTime(data.pb) - parseTime(data.goal.time);
            }
            const achieved = diff < 0;
            goalSub.textContent = 'PB ' + (achieved
            ? '-' + Math.abs(diff).toFixed(2) + ' \u2714\ufe0f'
            : '+' + diff.toFixed(2));
            goalSub.style.color = achieved ? '#00ff00' : '#aaaaaa';
        }
        if (data.goal.rank) {
            goalReason.textContent = getRankString(data.goal.rank) + (
                data.goal.classed ? " in class" : " in world"
            );
        } else if (data.goal.type == 'standard-6') {
            goalReason.textContent = '115% of hero';
        } else if (data.goal.type == 'standard-1') {
            goalReason.textContent = '50% of god';
        } else {
            goalReason.textContent = '';
        }
    }

    var pbMain = document.getElementById('pb-main');
    var pbSub = document.getElementById('pb-sub');
    if (!data.pb) {
        pbMain.className = 'main placeholder';
        pbMain.textContent = 'No PB yet';
    } else {
        pbMain.className = 'main';
        pbMain.textContent = data.pb;
    }
    pbSub.textContent = data.factoid || '';
    pbSub.style.color = '#aaaaaa';

    if (data.totals) {

        const laps_completed = data.totals.laps_won;
        const courses_completed = data.totals.courses_won;
        const completion_label = data.totals.label;
        const el_completion_courses = document.getElementById('completion-courses');
        const el_completion_laps = document.getElementById('completion-laps');
        el_completion_courses.textContent = `${courses_completed}/${data.totals.courses_total} Courses`;
        el_completion_laps.textContent = `${laps_completed}/${data.totals.laps_total} Laps`;
        document.getElementById('overall-category').textContent = completion_label;
        if (courses_completed === data.totals.courses_total) {
            el_completion_courses.style.color = "#3dc1ea";
        } else {
            el_completion_courses.style.color = null;
        }
        if (laps_completed === data.totals.laps_total) {
            el_completion_laps.style.color = "#3dc1ea";
        } else {
            el_completion_laps.style.color = null;
        }
    }
}

function manualRender() {
    let data = {};

    let sessionBest = document.getElementById('session-best-set').value;
    let attempts = document.getElementById('attempt-set').value;

    let goalTime = document.getElementById('target-time-set').value;
    
    let pbTime = document.getElementById('personal-best-set').value;

    let factoid = document.getElementById('factoid-set').value;

    let targetLabel = document.getElementById('target-label-set').value;

    if (sessionBest) {
        data.session = {
            bestTime: isValidTime(sessionBest) ? sessionBest : null,
            attempts: attempts,
        }
    }

    data.goal = {
        time: isValidTime(goalTime) ? goalTime : null,
        type: targetLabel
    };

    data.pb = isValidTime(pbTime) ? pbTime : null;

    if (factoid) {
        data.factoid = factoid;
    }

    data.totals = {
        courses_won: document.getElementById('completion-courses-set').value,
        laps_won: document.getElementById('completion-laps-set').value,
        courses_total: document.getElementById('completion-courses-total-set').value,
        laps_total: document.getElementById('completion-laps-total-set').value,
        label: document.getElementById('completion-label-set').value
    }

    render(data);
}

const trackTypeSelect = document.getElementById('track-type');
trackTypeSelect.addEventListener('change', () => {
    loadTracks()
})

const targetSelect = document.getElementById('target');
targetSelect.addEventListener('change', (event) => {
    targetTypeSelected(event.target.value);
});

function targetTypeSelected(value) {
    document.querySelectorAll('.target-detail').forEach(element => {
        const isHidden = element.dataset.target !== value;
        element.style.display = isHidden ? 'none' : 'flex';
        element.hidden = isHidden;
    });
}

function getUser() {
    return document.getElementById('username').value;
}

function getTrack() {
    return parseInt(document.getElementById('track').value);
}

function getCategory() {
    return parseInt(document.getElementById('category').value);
}

const asTargetId = (type) => `target-${type}`;
const asStandard = (type) => `standard-${type}`;

class Target {
    constructor() {
        this.type = document.getElementById('target').value;
        if (this.type) {
            this.value = document.getElementById(asTargetId(this.type)).value;
        }
        this.entry = null;
    }

    updateEntry(entries, context) {
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
                const track = tracks.find(track => track.id === context.track_id);
                const match = track?.standards
                .filter(standard => standard.category_id === context.category_id)
                .find(standard => standard.tier_id === parseInt(this.value))
                if (match) syntheticEntry.time_formatted = match.time_formatted;
            }
            return syntheticEntry;
        }
        if (this.type === 'ctr4ever') {
            return ctr4ever[context.track_id][context.category_id].find(entry => entry.name === this.value);
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
                        player1_id: players.find(player => player.name === username)["id"],
                                     player2_id: players.find(player => player.name === this.value)["id"]
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

const loadButton = document.getElementById('load-auto');
loadButton.addEventListener('click', () => {
    autoRender()
});

const loadManualButton = document.getElementById('load-manual');
loadManualButton.addEventListener('click', () => {
    manualRender()
});

async function autoRender() {

    const username = getUser();
    const track_id = getTrack();
    const category_id = getCategory();
    const target = new Target();

    document.body.classList.add('is-loading');

    try {
        await apiAction({
            body: JSON.stringify({
                endpoint: 'leaderboards',
                paginate: true,
                max_age: 3600,
                params: {
                    track_id: track_id,
                    category_id: category_id
                }
            })
        })
        .then(async data => {
            if (target.type === 'ctr4ever') {
                await apiAction({
                    body: JSON.stringify({
                        endpoint: 'ctr4ever',
                        params: {
                            track: tracks.find(track => track['id'] === track_id)['name'],
                                         category: category_id === 1 ? 'course' : 'lap'
                        }
                    })
                })
                .then(async data => {
                    ctr4ever[track_id] ||= {};
                    ctr4ever[track_id][category_id] = data["data"];
                })
            }
            return data;
        })
        .then(async data => {
            let entries = data["data"];

            const target_time_el = document.getElementById('target-time-set');
            const best_time_el = document.getElementById('personal-best-set');
            const target_label_el = document.getElementById('target-label-set');

            const pb_match = entries.find(entry => entry.name === username);
            if (pb_match) {
                //set the manual field as a side effect
                best_time_el.value = pb_match.time_formatted
            }

            const target_match = target.updateEntry(entries, {
                username: username,
                track_id: track_id,
                category_id: category_id
            });
            if (target_match) {
                //set the manual field as a side effect
                target_time_el.value = target_match.time_formatted
            }

            const pb_time = (pb_match ? pb_match.time_formatted : null);
            const target_time = (target_match ? target_match.time_formatted : null);

            const target_label = target.label(target_match);
            target_label_el.value = target_label;

            const target_totals = null;
            //TODO
            //  store the relative difficulty of each goal track (at least by time away for now)
            //  and then fill in those values from each fields' intended logic

            // const target_totals = await target.totals(username);
            // if (target_totals) {
            //   //set the manual field as a side effect
            //   document.getElementById('completion-courses-set').value = target_totals.courses_won;
            //   document.getElementById('completion-laps-set').value = target_totals.laps_won;
            //   document.getElementById('completion-courses-total-set').value = target_totals.courses_total;
            //   document.getElementById('completion-laps-total-set').value = target_totals.laps_total;
            //   document.getElementById('completion-label-set').value = target_totals.label;
            // }

            render({
                session: null,
                goal: {time: target_time, type: target_label},
                pb: pb_time,
                factoid: 'auto-generated',
                totals: target_totals
            });
        });
    } catch (e) {
        console.error(e);
    } finally {
        document.body.classList.remove('is-loading');  // reverts to default/inherited behavior
    }
}

async function apiAction(json) {
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");

    return await fetch(API_URL + "/webhook", {
        ...json,
        headers: myHeaders,
        method: 'POST'
    })
    .then(r => r.json())
}

async function loadStandards() {

    return await apiAction({
        body: JSON.stringify({
            endpoint: 'standards',
            paginate: true,
            max_age: 3600
        })
    })
    .then(data => {
        standards = data["data"].reverse();

        const select = document.getElementById('target-standard');

        select.innerHTML = '';

        standards.forEach(standard => {
            if (standard.include_in_average) {
                select.add(new Option(standard.name, standard.id));
            }
        });
    });

}

function matches_track_type_filter(track_type) {
    const track_type_filter = document.getElementById("track-type").value;
    if (track_type_filter) {
        return track_type === track_type_filter;
    }
    return true;
}

async function loadPlayers() {

    return await apiAction({
        body: JSON.stringify({
            endpoint: 'players',
            paginate: true,
            max_age: 3600,
        })
    })
    .then(data => {
        players = data["data"];

        //internal use; no fields are affected
    })
}

async function loadTracks() {

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
        tracks = data["data"]
        .filter(track => matches_track_type_filter(track.track_type));

        const select = document.getElementById('track');

        select.innerHTML = '<option value="0">None</option>';

        tracks.forEach(track => {
            select.add(new Option(track.name, track.id));
        })
    })
    .then(_ => { //new set of tracks means we need to update whether ctr4ever targets are visible
        let target = document.getElementById('target');
        let options = [...target.options];
        if (trackTypeSelect.value === 'original') {
            options.find(option => option.value === 'ctr4ever').disabled = false;
        } else {
            options.find(option => option.value === 'ctr4ever').disabled = true;
            if (target.selectedOptions[0]?.disabled) {
                const firstEnabledOption = Array.from(target.options)
                .find(option => !option.disabled);
                if (firstEnabledOption) {
                    target.value = firstEnabledOption.value;

                    target.dispatchEvent(new Event('change'));
                }
            }
        }
    })
}

let delayedQueue = [];

//also determines the load order
const persistedFields = ['username', 'category', 'target', 'track-type', 'track',
'target-user', 'target-rank', 'target-percentile', 'target-standard',
'personal-best-set', 'target-time-set', 'factoid-set', 'target-label-set',
'completion-label-set', 'completion-courses-set', 'completion-laps-set', 'completion-courses-total-set', 'completion-laps-total-set'
];
const delayedFields = ['target-standard', 'track'];
const dispatchingFields = ['target', 'track']; //others fire events but we don't want more than one fire

function saveFieldValues() {
    const state = {};
    persistedFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) state[id] = el.value;
    });
        localStorage.setItem('sessionForm', JSON.stringify(state));
}

function restoreFieldValues() {
    const saved = JSON.parse(localStorage.getItem('sessionForm') || '{}');
    persistedFields.forEach(id => {
        let callback = function () {
            const el = document.getElementById(id);
            if (el && saved[id] !== undefined) {
                el.value = saved[id];
                if (dispatchingFields.includes(id)) {
                    el.dispatchEvent(new Event('change'));
                }
            }
        }
        if (delayedFields.includes(id)) {
            delayedQueue.push(callback);
        } else {
            callback();
        }
    });
}

function runDelayedQueue() {
    delayedQueue.forEach(callback => callback());
    delayedQueue = [];

    manualRender();
}

// Restore on page load
document.addEventListener('DOMContentLoaded', restoreFieldValues);

// Save whenever any tracked field changes
persistedFields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('change', saveFieldValues);
    }
});

document.querySelectorAll("#session-best-set, #personal-best-set, #target-time-set").forEach(el => {
    el.maxLength = 7;
    el.onkeydown = (e) => {
        const nextMasked = formatTimeMask(e.target.value);
        el.value = nextMasked;
    };
});

Promise.allSettled([loadTracks(), loadStandards(), loadPlayers()])
.then(results => {
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
        failures.forEach(f => console.error("Startup task failed:", f.reason));
    }
    runDelayedQueue()
});

// var demoStates = [
//   { session: null, goal: { time: '1:04.22', type: 'standard-5' }, pb: null, factoid: '+12.23 vs WR' },
//   { session: { bestTime: '1:12.44', attempts: 14 }, goal: { time: '1:04.22', type: 'Blounard', rank: 3 }, pb: '1:08.04', factoid: '23 personal times submitted' },
//   { session: { bestTime: '1:12.44', attempts: 14 }, goal: { time: '1:04.22', type: 'BiggyBoy', rank: 1, classed: true }, pb: '1:08.04', factoid: '278 community times submitted' },
//   { session: { bestTime: '1:03.90', attempts: 3 }, goal: { time: '1:02.88', type: 'Infernal', rank: 1 }, pb: '1:03.40', factoid: 'achieved 4 Apr 2026' },
//   { session: { bestTime: '1:02.11', attempts: 61 }, goal: { time: '1:03.10', type: 'Washizaki Keenan', rank: 105, classed: true }, pb: '1:02.11', factoid: 'beats 57% of runs' },
//   { session: { bestTime: '1:02.11', attempts: 61 }, goal: { time: '1:03.10', type: 'standard-1' }, pb: '1:02.11', factoid: '10.4% of runs beat HERO' },
//   { session: { bestTime: '1:02.11', attempts: 61 }, goal: { time: '1:03.10', type: 'Current PB' }, pb: '1:02.11', factoid: 'speed\'s best standard: TITAN' },
// ];
// var demoIndex = 1;
// render(demoStates[demoIndex]);
// setInterval(function () {
//   demoIndex = (demoIndex + 1) % demoStates.length;
//   render(demoStates[demoIndex]);
// }, 1000);
