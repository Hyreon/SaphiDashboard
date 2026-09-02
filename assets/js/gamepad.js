let refresh = null;

let boundButtonIndex = null;
let previousButtonState = false;

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
    refresh();
}

export function init(refreshFunction) {

    window.addEventListener("gamepadconnected", (event) => {
        console.log("Gamepad connected:", event.gamepad.id);
        pollGamepad()
    });

    window.addEventListener("gamepaddisconnected", (event) => {
        console.log("Gamepad disconnected:", event.gamepad.id);
    });

    rebindButton.addEventListener("click", unbindButton);

    refresh = refreshFunction;

}