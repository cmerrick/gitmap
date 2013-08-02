import os, sys, requests, flask, json, urlparse
from flask import Flask, request, render_template, redirect, session, url_for

app = Flask(__name__)
app.config['DEBUG'] = True
app.secret_key = os.environ['SESSION_SECRET']

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

def make_request(url):
    return requests.get(url, params={ 'access_token': session['token'] })

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
def milestones_json(orgname):
    r = make_request('https://api.github.com/orgs/%s/repos' % orgname)

    def get_milestones(repo):
        r = make_request(repo['milestones_url'].split('{')[0])
        out = r.json();
        for ms in out:
            ms['repo'] = repo
        return out

    milestones = flattened([get_milestones(repo) for repo in r.json()])
    return flask.Response(json.dumps([m for m in milestones if len(m)]), mimetype="application/json")

@app.route('/api/repos/<orgname>/<reponame>/issues/events.json')
def milestone_json(orgname, reponame):
    r = make_request('https://api.github.com/repos/{0}/{1}/issues/events'.format(orgname, reponame))
    return flask.Response(json.dumps(r.json()), mimetype="application/json")
