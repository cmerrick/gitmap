var app = angular.module('gitmap', ['ui.bootstrap'])
    .config(['$routeProvider', function($routeProvider) {
	$routeProvider
	.when('/:orgname', { templateUrl: '/static/partials/org.html', controller: OrgCtrl })
	.otherwise({ redirectTo: '/' });
	}])
    .config(['$locationProvider', function($locationProvider) { $locationProvider.html5Mode(true).hashPrefix('!'); }])
    .filter('momentFormat', function() {
	return function (dateString, format) {
	    x = moment(dateString);
	    return x ? x.format(format) : null;
	};
    })
    .filter('momentFromNow', function() {
	return function (dateString) {
	    x = moment(dateString);
	    return x ? x.fromNow() : null;
	};
    })
    .filter('daysFromNow', function() {
	return function (dateString) {
	    x = moment(dateString);
	    now = moment();
	    return x ? x.diff(now, 'days') : null;
	};
    });

function OrgCtrl($scope, $http, $routeParams) {
    $scope.milestones = [];
    $scope.orgname = $routeParams.orgname;
    
    $http({
	method: 'GET',
	url: "/api/org/" + $scope.orgname + "/milestones.json"
    }).success(function(data, status) {
	$scope.milestones = data;
	$scope.getMilestoneEvents();
    });

    $scope.getMilestoneEvents = function() {
	var repos = _.chain($scope.milestones)
	    .map(function(milestone) { return milestone && milestone.repo && milestone.repo.name; })
	    .uniq()
	    .filter(function(x) { return x; }); //remove undefined's

	_(repos).each(function(repo) {
	    $http({
		method: 'GET',
		url: "/api/repos/" + $scope.orgname + "/" + repo + "/issues/events.json"
	    }).success(function(data, status) {
		_(data).chain()
                    .filter(function(e) { return e.issue && e.issue.milestone; })
                    .each(function(event) {
			milestone = _($scope.milestones).find(
			    function(milestone) {
				return milestone.repo.name == repo && milestone.number == event.issue.milestone.number;
			    });
			if(!milestone.eventsByIssue) 
                            milestone.eventsByIssue = [];
                        if(!milestone.eventsByIssue[event.issue.number])
                            milestone.eventsByIssue[event.issue.number] = [];

			milestone.eventsByIssue[event.issue.number].push(event);
		    });

                _.chain($scope.milestones)
                    .filter(function(m) { return m.repo.name == repo; })
                    .each(function(m) { 
                        m.event_summaries = summarizeEvents(m.eventsByIssue);
                        return m;
                    });
	    });
            
	});		    
    };

    var summarizeEvents = function(eventsByIssue) {        
        return _(eventsByIssue).map(function(issueEvents) { 
            var out = {};
            out.title = _(issueEvents).first().issue.title;
            out.url = _(issueEvents).first().issue.html_url;
            out.last_modified = _(issueEvents).max(function(event) {
                return moment(event.created_at);
            }).created_at;

            out.users = _.chain(issueEvents)
                .map(function(e) { return e.actor })
                .uniq(function(u){ return u.login; })
                .value();
            return out;
        });
    };

    $scope.progress = function(milestone) {
	return !milestone.open_issues ? milestone.open_issues : 
	    (milestone.closed_issues / (milestone.closed_issues + milestone.open_issues)) * 100;
    }

    $scope.stripBracketTags = function(string) {
	if(!string) return;
	out = string.slice(string.lastIndexOf("]")+1).trim(" ");
	return out;
    }

    $scope.parseBracketTags = function(string) {
	var regex = /[\[](.+?)[\]]/g
	var out = [];
	while(res = regex.exec(string)) {
	    out.push(res[1]);
	}
	return out;
    }

    $scope.toggleDetails = function(ms) {
	ms.showDetails = !ms.showDetails;
    }
	
}

