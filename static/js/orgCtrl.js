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
    }).directive('activityGrid', function() {
        return {
            restrict: 'E',
            scope: {
                nodes: "=nodes"
            },
            link: function(scope, elem, attrs) {
                scope.$watch('nodes', function(nodes) {
                    if(nodes) {
                        var nodeData = scope.nodes;
                        var selector = elem[0];
                        
                        var width = 150,
                	height = 30,
                	padding = .2;

                        var rectGrid = d3.layout.grid()
                            .bands()
                            .size([width, height])
                            .padding([padding, padding])
                            .rows(1)
                            .cols(7);
                        
                        var svg = d3.select(selector).append("svg")
                            .attr({
                                width: width,
                                height: height
                            });
                        
                        var renderRect = function(rectSelector, classNames) {
                            rectSelector.append("rect")
                                .attr("class", classNames)
                                .attr("width", rectGrid.nodeSize()[0])
                                .attr("height", rectGrid.nodeSize()[0])
                                .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
                                .style("stroke-width", 0)
                            	.style("fill", function(d) { return d.value ? '#3a3' : '#eee'; })
                                .attr("data-toggle", "tooltip")
                                .attr("data-delay", 200)
                                .attr("data-container", "body")
                                .attr("title", function(d) { 
                                    if(d.date.startOf('day').valueOf() === moment().startOf('day').valueOf())
                                        return "today";
                                    return d.date.startOf('day').from(moment().startOf('day')); 
                                });
                        };
                        
                        renderRect(svg.selectAll(".rect").data(rectGrid(nodeData)).enter(), "rect activity");
                        _(svg.selectAll(".rect")).each(function(x) {
                            $(x).tooltip();
                        });

                    }
                });
            }
        }
    });

function OrgCtrl($scope, $http, $routeParams) {
    $scope.milestones = [];
    $scope.milestonesLoaded = false;
    $scope.orgname = $routeParams.orgname;
    $scope.eventsByIssue = [];

    var _past7 = [];
    var _event_lookback = moment().subtract('d', 7);
    var _current = moment().subtract('d', 7);
    while((_current = _current.add('d', 1)) < moment()) {
        _past7.push(moment(_current).milliseconds(0).seconds(0).minutes(0).hours(0));
    }
    _past7.reverse(); //descending left-to-right
    
    $http({
	method: 'GET',
	url: "/api/org/" + $scope.orgname + "/milestones.json"
    }).success(function(data, status) {
	$scope.milestones = data;
        $scope.org_avatar_url = data[0].repo.owner.avatar_url;
        $scope.milestonesLoaded = true;
	$scope.getMilestoneEvents();
    });

    $scope.getMilestoneEvents = function() {
	var repos = _.chain($scope.milestones)
	    .map(function(milestone) { return milestone && milestone.repo && milestone.repo.name; })
	    .uniq()
	    .compact();
	_(repos).each(function(repo) {
            getAllPages("/api/q?q=/repos/" + $scope.orgname + "/" + repo + "/issues/events")
                .then(function(d) {
                    console.log(d);
                    parseEventsData(d, repo);
                });
	});		    
    };

    var getAllPages = function(url, all_data) {
        if(!all_data)
            all_data = []

        return $http.get(url).then(function(response) {
            all_data = all_data.concat(response.data);
            
            var next_url;
            
            if (response.headers()['link']) {
                var links = parseLinkHeader(response.headers()['link']);
                if(links.rels.next)
                    next_url = "/api/q?q=" + encodeURIComponent(links.rels.next.href);
            }

            last_date = moment(response.data[response.data.length - 1].created_at)
            if(next_url && last_date.valueOf() > _event_lookback.valueOf()) {
                return getAllPages(next_url, all_data);
            } else {
                return all_data;
            }
        });
    };

    var parseIssuesData = function(data, repo) {
	_(data).chain()
            .filter(function(issue) { return issue.milestone; })
            .each(function(issue) {
		milestone = _($scope.milestones).find(
		    function(milestone) {
			return milestone.repo.name == repo && milestone.number == issue.milestone.number;
		    });
                
		if(!milestone.issues) 
                    milestone.issues = [];
                
                milestone.issues.push(issue);
                
	    });

        _($scope.milestones).chain()
            .filter(function(m) { return m.repo.name == repo; })
            .each(function(m) { 
                var active_days = extractDays(m.issues, 'updated_at');
                m.past7_activity = _.map(_past7, function(momObj) {
                    var dateIfActive = _.find(active_days, function(activeDay) {
                        return activeDay.valueOf() == momObj.valueOf()
                    });
                    
                    if(dateIfActive)
                        return {date: momObj, value: true}
                    else
                        return {date: momObj, value: false}
                });
            });                

        
    };

    //copied for safe-keeping
    var parseEventsData = function(data, repo) {
	_(data).chain()
            .filter(function(e) { return e.issue && e.issue.milestone; })
            .each(function(event) {
		milestone = _($scope.milestones).find(
		    function(milestone) {
			return milestone.repo.name == repo && milestone.number == event.issue.milestone.number;
		    });

                if(milestone) { //milestone could already be closed
                    //and therefore not in our list
		    if(!milestone.eventsByIssue) 
                        milestone.eventsByIssue = [];
                    
                    //we use event.issue.number here because it is
                    //unique per-issue
                    if(!milestone.eventsByIssue[event.issue.number])
                        milestone.eventsByIssue[event.issue.number] = [];
		    milestone.eventsByIssue[event.issue.number].push(event);
                }   
	    });
        
        _($scope.milestones).chain()
            .filter(function(m) { return m.repo.name == repo; })
            .each(function(m) { 
                m.event_summaries = summarizeEvents(m.eventsByIssue);
                var active_days = extractDays(_.flatten(m.eventsByIssue), 'created_at');
                m.past7_activity = _.map(_past7, function(momObj) {
                    var dateIfActive = _.find(active_days, function(activeDay) {
                        return activeDay.valueOf() == momObj.valueOf()
                    });
                    
                    if(dateIfActive)
                        return {date: momObj, value: true}
                    else
                        return {date: momObj, value: false}
                });
            });                
    };
    

    var summarizeEvents = function(eventsByIssue) {        
        return _(eventsByIssue).chain().map(function(issueEvents) { 
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
        }).union([]).value(); //the union resets the array indexes
    };

    var extractDays = function(collection, date_field) {
         var days = _(collection).chain().map(function(e) { 
             return moment(e[date_field]).milliseconds(0)
                 .seconds(0).minutes(0).hours(0);
         }).uniq(function(m) { return m.valueOf(); }).value();
        return days;
    };

    $scope.progress = function(milestone) {
	return !milestone.open_issues ? milestone.open_issues : 
	    (milestone.closed_issues / (milestone.closed_issues + milestone.open_issues)) * 100;
    };

    $scope.stripBracketTags = function(string) {
	if(!string) return;
	out = string.slice(string.lastIndexOf("]")+1).trim(" ");
	return out;
    };

    $scope.parseBracketTags = function(string) {
	var regex = /[\[](.+?)[\]]/g
	var out = [];
	while(res = regex.exec(string)) {
	    out.push(res[1]);
	}
	return out;
    };

    $scope.toggleDetails = function(ms) {
	ms.showDetails = !ms.showDetails;
    };

    $scope.testData = [{ "value": true }, { "value": false }, { "value": true },
                       { "value": true }, { "value": false }, { "value": true }, { "value": true }];
}

