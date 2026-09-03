const TIME_REGEX = /^((\d{1}):)?([0-5]\d{1})\.(\d{2})$/;

export function isValidTime(time) {
    return TIME_REGEX.test(time);
}

export function parseTime(str) {
    const parts = str.split(':');
    let minutes = 0;
    let seconds = 0;
    if (parts.length > 1) {
        minutes = parseInt(parts[0]);
        seconds = parseFloat(parts[1]);
    } else {
        seconds = parseFloat(parts[0]);
    }
    return minutes * 60 + seconds;
}

export function formatTimeMask(raw) {
    let value = raw.replace(/(?<!^)-|[^0-9]/g, "");
    value = value.substring(0, 8);

    if (value.length > 1) {
        value = value.replace(/^(\d{1})(\d)/, "$1.$2");
    }

    if (value.length > 3) {
        value = value.replace(/^(\d{1}).(\d{1})(\d{1})/, "$1$2.$3");
    }
    
    if (value.length > 4) {
        value = value.replace(/^(\d{1})[6-9].(\d{1})(\d{1})/, "$15.$2$3");
        value = value.replace(/^(\d{1})(\d{1}).(\d{1})(\d{1})/, "$1:$2$3.$4");
    }
    
    return value;
}

export function scaleText(element, scale) {
    element.style.fontSize = '';
    const originalSize = parseFloat(window.getComputedStyle(element).fontSize);
    element.style.fontSize = `${originalSize * scale}px`;
}

export function getScaleWidth(element) {
    const originalWhiteSpace = element.style.whiteSpace;

    element.style.whiteSpace = 'nowrap';

    const actualWidth = element.clientWidth; //try 'scrollWidth'
    const availableWidth = getAvailableWidth(element);

    element.style.whiteSpace = originalWhiteSpace;

    return Math.min(1, availableWidth / actualWidth);
}

function getAvailableWidth(element) {

    const parent = element.parentElement;
    if (!parent) return window.innerWidth;

    const parentStyles = window.getComputedStyle(parent);

    const parentClientWidth = parent.clientWidth;

    const paddingLeft = parseFloat(parentStyles.paddingLeft);
    const paddingRight = parseFloat(parentStyles.paddingRight);

    return parentClientWidth - paddingLeft - paddingRight;

}

export function reportCollisionsOfElementsById(winningId, losingIds) {
    const winningElement = document.getElementById(winningId);
    const losingElements = losingIds.map(id => document.getElementById(id));
    return resolveElementCollision(winningElement, losingElements);
}

export function resolveElementCollision(winningElement, losingElements) {
    losingElements.forEach(losingElement => {
        setHidden(losingElement, false);
    });

    const filtered = losingElements.filter((losingElement) => {
        return collision(winningElement, losingElement);
    });

    return filtered;
}

export function setHidden(element, isHidden) {
    element.style.display = isHidden ? 'none' : 'flex';
    element.hidden = isHidden;
}

export function collision(el1, el2) {
    const rect1 = el1.getBoundingClientRect();
    const rect2 = el2.getBoundingClientRect();
    return !(rect1.right < rect2.left ||
        rect1.left > rect2.right ||
        rect1.bottom < rect2.top ||
        rect1.top > rect2.bottom);

}
export function getRankString(num) {
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

export function intersectionAlongParameter(set1, set2, parameter) {
    return set1.filter(item => set2.some(item2 => item[parameter] === item2[parameter]));
}

export function matchingAll(set, item, parameters) {
    parameters.forEach(parameter => {
        set = set.filter(setItem => setItem[parameter] === item[parameter]);
    })
    return set;
}

export function first(container) {
    if (container.length > 0) {
        return container[0];
    } else {
        return null;
    }
}
