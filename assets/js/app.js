//Created by Hyreon and TheKoji

import { init as initVoronoi } from '@hyreon/voronoi';
import { init as initAiBadge } from '@hyreon/ai-badge';
import {
    isValidTime,
    parseTime,
    formatTimeMask,
    setHidden,
    reportCollisionsOfElementsById,
    getScaleWidth, scaleText,
    getRankString
} from './utils';
import {Focus, Model, Target} from './model'; //Handles API calls; app has no awareness of these
import { init as initGamepadHooks } from './gamepad';

let model = new Model();

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
initGamepadHooks(manualRender);

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
    reloadTracks();
})

const targetSelect = document.getElementById('target');
targetSelect.addEventListener('change', (event) => {
    targetTypeSelected(event.target.value);
});

function targetTypeSelected(value) {
    document.querySelectorAll('.target-detail').forEach(element => {
        const isHidden = element.dataset.target !== value;
        setHidden(element, isHidden);
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

const overlay = document.getElementById('overlay');
const resizeObserver = new ResizeObserver((entries) => {
    const hiddenElements = new Set();
    reportCollisionsOfElementsById('completion-courses', ['overall-label'])
        .forEach(item => {
            hiddenElements.add(item)
        });
    reportCollisionsOfElementsById('completion-laps', ['overall-category'])
        .forEach(item => hiddenElements.add(item));

    const placeholders = document.getElementsByClassName('placeholder');
    for (let el of placeholders) {
        setHidden(el, false);
        if (getScaleWidth(el) !== 1) {
            hiddenElements.add(el);
        }
    }

    const eyebrows = document.getElementsByClassName('eyebrow');
    for (let el of eyebrows) {
        setHidden(el, false);
        if (getScaleWidth(el) !== 1) {
            hiddenElements.add(el);
        }
    }

    const subEyebrows = document.getElementsByClassName('eyebrow-sub');
    for (let el of subEyebrows) {
        setHidden(el, false);
        if (getScaleWidth(el) !== 1) {
            hiddenElements.add(el);
        }
    }

    hiddenElements.forEach(el => {
        setHidden(el, true);
    })

    let minScale = 1;
    const mains = document.getElementsByClassName('main');
    for (let el of mains) {
        el.style.fontSize = '';
        minScale = Math.min(minScale, getScaleWidth(el));
    }
    for (let el of mains) {
        scaleText(el, minScale);
    }

    for (let el of eyebrows) {
        scaleText(el, minScale);
    }

    const subs = document.getElementsByClassName('sub');
    for (let el of subs) {
        scaleText(el, minScale);
    }

    const fancySubs = document.getElementsByClassName('sub-fancy');
    for (let el of fancySubs) {
        scaleText(el, minScale);
    }
});

resizeObserver.observe(overlay);

const loadButton = document.getElementById('load-auto');
loadButton.addEventListener('click', () => {
    autoRender()
});

const loadManualButton = document.getElementById('load-manual');
loadManualButton.addEventListener('click', () => {
    manualRender()
});

const asTargetId = (type) => `target-${type}`;

async function autoRender() {

    const username = getUser();
    const track_id = getTrack();
    const category_id = getCategory();

    let targetType = document.getElementById('target').value;
    let targetValue = undefined;
    if (targetType) {
        targetValue = document.getElementById(asTargetId(targetType)).value;
    }

    const target = new Target(targetType, targetValue, model);

    let entries = await model.loadLeaderboard(track_id, category_id, target);

    //TODO handle blank / none entries correctly

    const target_time_el = document.getElementById('target-time-set');
    const best_time_el = document.getElementById('personal-best-set');
    const target_label_el = document.getElementById('target-label-set');

    const pb_match = entries.find(entry => entry.name === username);
    if (pb_match) {
        //set the manual field as a side effect
        best_time_el.value = pb_match.time_formatted
    }

    const focus = new Focus(
        model.userIdFromName(username),
        null,
        track_id,
        category_id,
        null
    );

    const target_match = target.getMatchingEntry(entries, focus);

    if (target_match) {
        //set the manual field as a side effect
        target_time_el.value = target_match.time_formatted
    }

    const pb_time = (pb_match ? pb_match.time_formatted : null);
    const target_time = (target_match ? target_match.time_formatted : null);

    const target_label = target.label(target_match);
    target_label_el.value = target_label;

    const target_totals = await target.totals(focus, false);
    if (target_totals) {
      //set the manual field as a side effect
      document.getElementById('completion-courses-set').value = target_totals.courses_won;
      document.getElementById('completion-laps-set').value = target_totals.laps_won;
      document.getElementById('completion-courses-total-set').value = target_totals.courses_total;
      document.getElementById('completion-laps-total-set').value = target_totals.laps_total;
      document.getElementById('completion-label-set').value = target_totals.label;
    }

    render({
        session: null,
        goal: {time: target_time, type: target_label},
        pb: pb_time,
        factoid: 'auto-generated',
        totals: target_totals
    });
}

function matches_track_type_filter(track_type) {
    const track_type_filter = document.getElementById("track-type").value;
    if (track_type_filter) {
        return track_type === track_type_filter;
    }
    return true;
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

async function reloadTracks() {
    await model.loadTracks()
        .then(_ => {
            let trackList = model.tracks.filter(track => matches_track_type_filter(track.track_type));

            const select = document.getElementById('track');

            select.innerHTML = '<option value="0">None</option>';

            trackList.forEach(track => {
                select.add(new Option(track.name, track.id));
            })
        })
        .then(_ => { //new set of tracks means we need to update whether ctr4ever targets are visible
            let target = document.getElementById('target');
            let options = [...target.options];
            let disables = false;

            if (trackTypeSelect.value === 'original') {
                options.find(option => option.value === 'ctr4ever').disabled = false;
            } else {
                options.find(option => option.value === 'ctr4ever').disabled = true;
                disables = true;
            }

            if (trackTypeSelect.value === 'community') {
                options.find(option => option.value === 'standard').disabled = true;
                disables = true;
            } else {
                options.find(option => option.value === 'standard').disabled = false;
            }

            if (disables) {
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

async function reloadStandards() {
    await model.loadStandards();
    const select = document.getElementById('target-standard');

    select.innerHTML = '';

    model.standards.forEach(standard => {
        if (standard.include_in_average) {
            select.add(new Option(standard.name, standard.id));
        }
    });
}

Promise.allSettled([reloadTracks(), reloadStandards(), model.loadPlayers()])
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
