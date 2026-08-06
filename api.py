import json

import flask_cors
import requests
import os
import sqlite3
from time import sleep
import flask

DB_FILE = "api_state.db"
TARGET_API = "https://www.projectsaphi.com/api/v2/"

API_KEY = os.environ.get("TARGET_API_KEY")

if not API_KEY:
    with open("api_key.txt", "r", encoding="utf-8") as file:
        API_KEY = file.read().strip()

SAFETY_LIMIT = 30
limit = [120, 1]
auth = True

class Endpoint:

    def __init__(self, base_endpoint, params=None):
        self.base_endpoint = base_endpoint
        self.params = params

    def __str__(self):
        suffix = ""
        if self.params:  # not none or empty
            params_strings = [f"{x}={y}" for x, y in self.params.items()]
            suffix = "?" + "&".join(params_strings)
        print(self.base_endpoint + suffix)
        return self.base_endpoint + suffix

def safe_request(**kwargs):
    if limit[0] <= SAFETY_LIMIT:
        print(f"Too many calls! Sleeping for {limit[1]}")
        sleep(limit[1])
    ret = requests.get(**kwargs)

    # Extract rate limit headers safely (defaults to None if missing)
    limit[0] = int(ret.headers.get("X-RateLimit-Remaining"))
    limit[1] = int(ret.headers.get("X-RateLimit-Reset"))
    print(limit)

    return ret

def db_action(query, params=(), fetching=None):
    conn = sqlite3.connect(DB_FILE)
    try:
        with conn:  # handles committing if there are no errors
            cursor = conn.cursor()
            cursor.execute(query, params)

            if fetching == 1:
                values = cursor.fetchone()
            elif isinstance(fetching, int):
                values = cursor.fetchmany(fetching)
            elif fetching == "all":
                values = cursor.fetchall()
            else:
                values = None

            return values
    finally:
        conn.close()

def init_db():
    db_action(
        """
        CREATE TABLE IF NOT EXISTS api_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            endpoint TEXT,
            status_code INTEGER,
            etag TEXT,
            response_data TEXT
        )"""
    )

    try:
        db_action("ALTER TABLE api_status ADD COLUMN endpoint TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        db_action("ALTER TABLE api_status ADD COLUMN etag TEXT")
    except sqlite3.OperationalError:
        pass

def get_last_status(endpoint=None, max_age=None):
    clauses = []
    params = []

    query = "SELECT timestamp, status_code, etag, response_data FROM api_status"

    if endpoint:
        clauses.append("endpoint = ?")
        params.append(endpoint)

    if max_age is not None:
        if max_age == 0:
            return None  # nothing matches
        else:
            offset_str = f"-{max_age} seconds"
            clauses.append("timestamp >= datetime('now', ?)")
        params.append(offset_str)

    if clauses:
        query += " WHERE " + " AND ".join(clauses)

    query += " ORDER BY id DESC LIMIT 1"

    return db_action(query, tuple(params), fetching=1)

def generate_headers(last_record, auth):
    headers = {}
    if auth:
        headers["Saphi-Api-Key"] = f"{API_KEY}"
    if last_record and last_record[2]:  # last_record[2] is the etag slot
        headers["If-None-Match"] = '"' + last_record[2] + '"'
    return headers


def has_more_pages(response_text):
    response_json = json.loads(response_text)
    try:
        return response_json["meta"]["current_page"] < response_json["meta"]["total_pages"]
    except KeyError as e:
        print(response_json)
        return False

def fetch(endpoint, auth=True, timeout=3.0, max_age=60.0):
    endpoint_str = str(endpoint)
    full_url = TARGET_API + endpoint_str
    last_record = get_last_status(endpoint=endpoint_str)
    headers = generate_headers(last_record, auth)

    if max_age is None or max_age:
        hot_record = get_last_status(endpoint=endpoint_str, max_age=max_age)
        if hot_record:
            return hot_record

    try:
        response = safe_request(url=full_url, headers=headers, timeout=timeout)

        # 304 means nothing changed; we don't need to re-download or insert a duplicate body
        if response.status_code == 304:
            print(f"[Cache Validated] Server returned 304 Not Modified for '{endpoint_str}'.")
            db_action(
                "UPDATE api_status SET timestamp = CURRENT_TIMESTAMP WHERE endpoint = ?",
                (endpoint_str,)
            )
            return last_record

        # Extract the new ETag from headers (if provided by the API)
        raw_etag = response.headers.get("ETag")
        if raw_etag:
            # Clean up things like W/"..." or suffixes like -gzip
            new_etag = raw_etag.strip("\"")
            if new_etag.startswith('W/'):
                new_etag = new_etag[2:]
            # Optional: strip common compression suffixes if they bleed into the string value
            if new_etag.endswith('-gzip'):
                new_etag = new_etag[:-5]
        else:
            new_etag = None

        db_action(
            """
            INSERT INTO api_status (endpoint, status_code, etag, response_data)
            VALUES (?, ?, ?, ?)
            """,
            (endpoint_str, response.status_code, new_etag, response.text)
        )

        return get_last_status(endpoint_str)  # fresh pull, always matches the current db entry format

    except (requests.exceptions.RequestException) as e:
        # 4. Fallback: If network/server fails or overloads, use local cache if available
        print(f"[Warning] API unreachable or overloaded ({e}). Falling back to local cache...")

        if last_record:
            return last_record

        # If we have no local cache either, return None
        print(f"[Error] No cached data available for '{endpoint_str}'.")
        return None

def fetch_all(endpoint, auth=True, timeout=3.0, max_age=60.0):
    responses = []
    last_response = None
    while not last_response or has_more_pages(last_response[3]):
        last_response = fetch(endpoint, auth, timeout, max_age)
        responses.append(last_response)
        endpoint.params["page"] = endpoint.params.get("page", 1) + 1
    return responses

def join_data(fetch_all_results):
    try:
        items = [json.loads(r[3]) for r in fetch_all_results]
        data = [entry for item in items for entry in item["data"]]
        print([item["meta"] for item in items])
        timestamp = min([result[0] for result in fetch_all_results])  # oldest item shows how old the data can be
        return (timestamp, data)
    except Exception as e:
        return fetch_all_results  # don't do anything. the data is unusual for some reason and the client needs to deal with this

app = flask.Flask(__name__)
flask_cors.CORS(app)

def get_flask_response():
    data = flask.request.get_json(silent=True) or {}

    print(f"Received data: {data}")

    if "endpoint" not in data:
        print("Missing endpoint!")
        return flask.jsonify({
            "status": "error",
            "message": "Missing required payload key 'endpoint'"
        }), 400

    if "paginate" not in data:
        data["paginate"] = False

    if "max_age" not in data:
        if "use_cache" in data and data["use_cache"]:
            data["max_age"] = None
        else:
            data["max_age"] = 0

    endpoint_name = data["endpoint"]
    paginate = data["paginate"]
    max_age = data["max_age"]
    params = data.get("params", {})

    # TODO auth check

    try:
        if paginate:
            if auth:
                params['per_page'] = 500
            last_record = join_data(fetch_all(Endpoint(endpoint_name, params), auth=auth, max_age=max_age))
        else:
            last_record = fetch(Endpoint(endpoint_name, params), auth=auth, max_age=max_age)
            if last_record and isinstance(last_record[-1], str):
                last_record[-1] = json.loads(last_record[-1])
    except Exception as e:
        print(f"Processing error: {e}")
        return flask.jsonify({
            "status": "error",
            "message": "Internal data processing failure"
        }), 500

    if last_record:
        print(f"Timestamp: {last_record[0]}")
        print(f"Data (str): {str(last_record[-1])[:100]}")
        return flask.jsonify({"status": "success", "age": last_record[0], "data": last_record[-1]})
    else:
        print("Unable to get a record.")
        return flask.jsonify({"status": "error", "message": "Nothing stored locally, and the Saphi API is down."}), 404

@app.route('/webhook', methods=['POST', 'OPTIONS'])
def listen():
    if flask.request.method == 'OPTIONS':
        resp = flask.make_response()
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        return resp

    response = get_flask_response()
    print(response)
    return response

if __name__ == "__main__":
    init_db()

    app.run(host='127.0.0.1', port=3003, debug=True)