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