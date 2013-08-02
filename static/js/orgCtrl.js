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
    $scope.repo_events = [];
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
		_(data).each(function(event) {
		    if(event.issue && event.issue.milestone) {
			milestone = _($scope.milestones).find(
			    function(milestone) {
				return milestone.repo.name == repo && milestone.number == event.issue.milestone.number;
			    });
			if(!milestone.events) milestone.events = []
			milestone.events.push(event);
		    }
		});
	    });		    
	});
    }

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

