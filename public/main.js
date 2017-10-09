'use strict';

var DealsList = (function(){

	var control = {};

	var events = {
		filter: function(event){
			var inputQuery = (control.query.value().toString() || 'probability_ >= 75 && probability_ <= 99');
			control.query.status = undefined;
			inputQuery = inputQuery
				.replace(/=+/g, '=')
				.replace(/[^!><]=+/g, '==');
			try{
				var matcher = new RegExp(Object.keys(Deal.properties).join('|'), 'g');
				var query = inputQuery.replace(matcher, function(propertyName){
					return 'deal["' + propertyName + '"]';
				});
				var deal = {};
				eval(query);
				Deal.filter(function(deal){
					return eval(query);
				});
			}catch(error){
				control.query.status = 'error';
			}
			Location.query({query: inputQuery});
			control.query.value(inputQuery);
		},
		highlight: function(event){
			var deal = this;
			var highlightNum = control.highlights.indexOf(deal.dealId);
			if(highlightNum >= 0){
				control.highlights.splice(highlightNum, 1);
			}else{
				control.highlights.push(deal.dealId);
			}
		},
		incrementMonths: function(event){
			var incrementor = this;
			control.startMonth.setMonth(control.startMonth.getMonth() + incrementor);
			control.months = control.startMonth.throughNMonths(control.numMonths);
			Location.query({startMonth: views.monthName(control.startMonth)});
		},
		loadDeals: function(event){
			control.loadStatus.offset = 0;
			control.loadStatus.doContinue = true;
			control.loadStatus.message = 'Loading...';

			Deal.clear();
			loadNextPage();

			function loadNextPage(){
				m.request({
					url: '/deals',
					method: 'GET',
					data: {
						limit: 250,
						offset: (control.loadStatus.offset || 0),
						properties: Object.keys(Deal.properties).join(',')
					}
				}).then(parseResponse);
			}

			function parseResponse(response){
				if(response.success && control.loadStatus.doContinue){
					response.deals.forEach(Deal.new);
					control.loadStatus.offset = response.offset;
				}
				if(!(control.loadStatus.stopAfterFirst) && response.success && response.hasMore && control.loadStatus.doContinue){
					control.loadStatus.message = 'Loading ' + Deal.all.length + '...';
					loadNextPage();
				}else{
					control.loadStatus.message = 'Finishing...';
					setTimeout(events.stopLoading, 10);
				}
			}
		},
		refreshDeals: function(event){
			control.loadStatus.offset = 0;
			control.loadStatus.doContinue = true;
			control.loadStatus.message = 'Loading...';

			loadNextPage();

			function loadNextPage(){
				m.request({
					url: '/deals/refresh',
					method: 'GET',
					data: {
						count: 100,
						since: control.loadStatus.lastRefresh
					}
				}).then(parseResponse);
			}

			function updateDeal(dealInput){
				Deal.allById[dealInput.dealId].updateProperties(dealInput);
			}

			function parseResponse(response){
				if(response.success && control.loadStatus.doContinue){
					response.results.forEach(updateDeal);
					control.loadStatus.offset = response.offset;
				}
				if(!(control.loadStatus.stopAfterFirst )&& response.success && response.hasMore && control.loadStatus.doContinue){
					control.loadStatus.message = 'Loading ' + response.offset + '...';
					loadNextPage();
				}else{
					control.loadStatus.message = 'Finishing...';
					setTimeout(events.stopLoading, 10);
				}
			}
		},
		sort: function(event){
			var sortProperty = this;
			var sortDirection = (control.sort.directions[sortProperty] == 'asc' ? 'desc' : 'asc');
			Deal.sortOn(sortProperty, sortDirection)
			control.sort.directions[sortProperty] = sortDirection;
			control.sort.activeSortProperty = sortProperty;
		},
		stopLoading: function(event){
			control.loadStatus.doContinue = false;
			control.loadStatus.lastRefresh = (new Date()).getTime();
			events.filter();
			Deal.sortOn(control.sort.sctiveSortProperty, control.sort.directions[control.sort.activeSortProperty]);
			control.loadStatus.message = (Deal.all.length + ' loaded in memory. ' + (Deal.allFiltered.length || 0) + ' match the current filters.');
			m.redraw();
		},
		updateInput: function(event){
			var stream = this;
			event.redraw = false;
			stream(event.target.value);
		}
	}

	var views = {
		monthName: function(date){
			return date.toArray().slice(0,2).join('/');
		},
		dateIntegerToString: function(integer){
			try{
				var string = integer.toString();
				return [string.substring(0,4), string.substring(4,6), string.substring(6)].join('/');
			}catch(e){
				return '';
			}
		},
		input: function(stream){
			return {
				value: stream(),
				oninput: events.updateInput.bind(stream)
			}
		},
		sortable: function(sortProperty){
			return {
				hasEvent: true,
				isCurrentlySorted: (sortProperty == control.sort.activeSortProperty),
				sortDirection: (control.sort.directions[sortProperty] || 'desc'),
				onclick: events.sort.bind(sortProperty)
			}
		}
	}

	var viewBlocks = {
		headerRow: function(){
			return m('tr.colheaders', [
				m('th', views.sortable('dealname'), 'Name'),
				control.months.map(function(date, index){
					var monthName = views.monthName(date);
					var content = [
						m('span', views.sortable('$' + monthName), monthName)
					];
					if(index == 0){
						content.unshift(m('span[dateshift=left]', {onclick: events.incrementMonths.bind(-1)}));
					}else if(index == (control.numMonths - 1)){
						content.push(m('span[dateshift=right]', {onclick: events.incrementMonths.bind(1)}));
					}
					return m('th.date.month', content);
				}),
				m('th', views.sortable('amount'), 'Amount'),
				m('th', views.sortable('probability_'), 'Prob %'),
				m('th', views.sortable('follow_up_date'), 'Follow-up'),
				m('th', views.sortable('closedate'), 'Close'),
				m('th', views.sortable('startdate'), 'Start'),
				m('th', views.sortable('end_date'), 'End')
			]);
		},
		subheaderRow: function(){
			return m('tr.subheaders.inputs', [
				m('th'),
				control.months.map(function(date, index){
					var monthName = '$' + views.monthName(date);
					return m('th.number', Deal.allFiltered.reduce(function(sum, deal){
						return sum += (deal[monthName] || 0);
					}, 0).toDollars());
				}),
				m('th.number', Deal.allFiltered.reduce(function(sum, deal){
					return sum += (deal.amount || 0);
				}, 0).toDollars()),
				m('th'),
				m('th'),
				m('th'),
				m('th'),
				m('th')
			]);
		},
		bodyRow: function(deal, index){
			var isHighlighted = (control.highlights.indexOf(deal.dealId) >= 0 ? true : '');
			var url = 'https://app.hubspot.com/sales/211554/deal/' + deal.dealId;
			return [
				m('tr.body[highlight=' + isHighlighted + ']', [
					m('td', {
						'highlight-toggle': true,
						onclick: events.highlight.bind(deal),
					}, [
						m('a[href=' + url + ']', (Deal.allFiltered.length - index) + '. ' + deal.dealname)
					]),
					control.months.map(function(date, index){
						var allocation = deal['$' + views.monthName(date)];
						return m('td.number', (allocation ? allocation.toDollars() : ''));
					}),
					m('td.number', deal.amount.toDollars()),
					m('td.number', deal.probability_),
					m('td.number', views.dateIntegerToString(deal.follow_up_date)),
					m('td.number', views.dateIntegerToString(deal.closedate)),
					m('td.number', views.dateIntegerToString(deal.startdate)),
					m('td.number', views.dateIntegerToString(deal.end_Date))
				])
			];
		}
	};

	return {
		oninit: function(){
			control = {};
			control.sort = {
				activeSortProperty: null,
				directions: {}
			};
			control.query = {
				value: m.stream(Location.query().query || ''),
				status: undefined
			};
			control.loadStatus = {
				stopAfterFirst: (Location.query().stopAfterFirst || false)
			};
			control.highlights = [];

			control.startMonth = (Date.fromYMD(Location.query().startMonth) || (new Date()).getFirstOfMonth());
			control.numMonths = 4;
			control.months = control.startMonth.throughNMonths(control.numMonths);

			events.loadDeals();
		},
		view: function(){
			return [
				m('h1', 'Deals'),
				control.loadStatus.doContinue ? [
					m('p', [
						m('span', control.loadStatus.message)
					])
				] : [
					Deal.all.length > 0 ? [
						m('p', [
							m('button', {onclick: events.refreshDeals}, 'Refresh'),
							m('span', control.loadStatus.message)
						]),
						m('p.label', [
							m('button', {onclick: events.filter}, 'Filter'),
							m('input.code', views.input(control.query.value).merge({
								error: (control.query.status ? 1 : 0)
							})),
						]),
						m('p', [
							m('span', 'You can filter on: '),
							m('code', Object.keys(Deal.properties).join(', '))
						])
					] : [
						m('p', [
							m('button', {onclick: events.loadDeals}, 'Load Deals')
						])
					]
				],
				m('table', [
					viewBlocks.headerRow(),
					viewBlocks.subheaderRow(),
					Deal.allFiltered.map(viewBlocks.bodyRow)
				])
			]
		}
	}
})();

document.addEventListener('DOMContentLoaded', function(){
	m.mount(document.getElementById('dealsList'), DealsList);
});
