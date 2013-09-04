#!venv/bin/python
import os, sys
import requests
import json
import urlparse
from hashlib import md5
import datetime
from flask import Flask, Response, request, render_template, redirect, session, url_for
from dateutil import parser, tz

def verify_env_var(var):
    value = os.environ.get(var)
    if value is None or len(value) == 0:
        print >> sys.stderr, 'You must set the ' + var + ' environment variable'
        exit(1)

verify_env_var('SESSION_SECRET')
verify_env_var('GH_CLIENT_KEY')
verify_env_var('GH_CLIENT_SECRET')

utc_zone = tz.gettz('UTC')

app = Flask(__name__)
VERSION = 3 #hack for the cache buster
app.config['DEBUG'] = True
app.secret_key = os.environ['SESSION_SECRET']

ASSET_REVISION = md5(str(VERSION)).hexdigest()[:14]

@app.url_defaults
def static_cache_buster(endpoint, values):
    if endpoint == 'static':
        values['_v'] = ASSET_REVISION

gh_auth_url = ("https://github.com/login/oauth/authorize"
               "?client_id=" + os.environ['GH_CLIENT_KEY'] + ""
               "&scope=repo")

gh_access_token_url = ("https://github.com/login/oauth/access_token"
                       "?client_id=" + os.environ['GH_CLIENT_KEY'] + ""
                       "&client_secret=" + os.environ['GH_CLIENT_SECRET'] + ""
                       "&code={0}")

# logging helper
def p(s):
    print s
    sys.stdout.flush()

@app.route("/api/q")
def q():
    wrap_headers = ["X-GitHub-Media-Type", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Link"]
    q = request.args.get('q').lower()
    prefix = "https://api.github.com"
    if q.startswith(prefix):
        url = q
    else:
        url = "https://api.github.com" + q

    r = make_request(url)

    headers = {}
    for k in wrap_headers:
        if k in r.headers:
            headers[k] = r.headers[k]
        
    return Response(r, headers=headers.iteritems())

def make_request(url, params={}):
    p(session)
    params = dict(params.items() + { 'access_token': session['token'] }.items())
    return requests.get(url, params=params)

def flattened(l):
    result = _flatten(l, lambda x: x)
    while type(result) == list and len(result) and callable(result[0]):
        if result[1] != []:
            yield result[1]
        result = result[0]([])
    yield result

def _flatten(l, fn, val=[]):
    if type(l) != list:
        return fn(l)
    if len(l) == 0:
        return fn(val)
    return [lambda x: _flatten(l[0], lambda y: _flatten(l[1:],fn,y), x), val]


def org_redirect():
    r = make_request('https://api.github.com/user/orgs')
    orgs = r.json()
    if r.status_code == 200 and len(orgs) == 1:
        return redirect('/app/' + orgs.pop(-1)['login'])
    else:
        return redirect('/orgs')

@app.route('/')
def index():
    if 'token' in session:
        return org_redirect()

    return render_template('index.html')

@app.route('/logout')
def logout():
    session.pop('token', None)
    return redirect(url_for('index'))

@app.route('/auth')
def auth():
  return redirect(gh_auth_url)

@app.route('/auth/callback')
def auth_callback():
    access_url = gh_access_token_url.format(request.args.get('code', ''))
    r = requests.post(access_url)
    p(r.text)
    session['token'] = urlparse.parse_qs(r.text)['access_token']
    return org_redirect()

@app.route('/orgs')
def orgs():
    r = make_request('https://api.github.com/user/orgs')
    return render_template('orgs.html', orgs=r.json())

@app.route('/app/<path:p>')
def appRoot(p):
    return render_template('app.html')

@app.route('/api/org/<orgname>/milestones.json')
def milestones(orgname):
    r = make_request('https://api.github.com/orgs/%s/repos' % orgname)

    def get_milestones(repo):
        r = make_request(repo['milestones_url'].split('{')[0])
        out = r.json();
        for ms in out:
            ms['repo'] = repo
        return out

    milestones = flattened([get_milestones(repo) for repo in r.json()])
    return Response(json.dumps([m for m in milestones if len(m)]), mimetype="application/json")

@app.route('/api/repos/<orgname>/<reponame>/issues/events.json')
def milestone_events(orgname, reponame):
    last_date = None
    since_time = datetime.datetime.now(utc_zone) - datetime.timedelta(days=7)
    all_events = []
    url = 'https://api.github.com/repos/{0}/{1}/issues/events'.format(orgname, reponame)
    while(url != None and (last_date == None or last_date > since_time)):
#        p("since_time: {0}, last_date: {1}".format(since_time, last_date))
        r = make_request(url)
        events = r.json()
        all_events += events
        if len(events):
            last_date = parser.parse(events[-1]['created_at']).astimezone(utc_zone)
        url = r.links['next']['url'] if 'next' in r.links else None

    return Response(json.dumps(all_events), mimetype="application/json")

@app.route('/api/repos/<orgname>/<reponame>/issues.json')
def issues(orgname, reponame):
    days_back = datetime.timedelta(days=7)
    since_time = datetime.datetime.now() - days_back
    since_param = since_time.isoformat()

    r = make_request('https://api.github.com/repos/{0}/{1}/issues'.format(orgname, reponame),
                     params={'sort': 'updated', 'since': since_param})
    return Response(json.dumps(r.json()), mimetype="application/json")

if __name__ == "__main__":
    app.run()
