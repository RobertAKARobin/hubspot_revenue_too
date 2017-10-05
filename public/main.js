'use strict';

var DealsList = (function(){

	var control = {};

	var events = {
		filter: function(event){
			var inputQuery = control.query.value();
			var deal = {};
			var matcher = new RegExp(Object.keys(Deal.properties).join('|'), 'g');
			control.query.status = undefined;
			try{
				var query = inputQuery.replace(matcher, function(propertyName){
					return 'deal["' + propertyName + '"]';
				})
				eval(query);
			}catch(error){
				control.query.status = 'error';
			}
			Deal.filter(function(deal){
				return eval(query);
			});
			Location.query({query: inputQuery});
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
			control.loadStatus = {
				offset: 0,
				doContinue: true
			}
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
				if(response.success && response.hasMore && control.loadStatus.doContinue){
					loadNextPage();
				}else{
					events.stopLoading();
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
				m('th'),
				m('th', views.sortable('dealname'), 'Name'),
				m('th', views.sortable('probability_'), 'Probability'),
				m('th', views.sortable('amount'), 'Amount'),
				m('th', views.sortable('closedate'), 'Close date'),
				m('th', views.sortable('startdate'), 'Start date'),
				control.months.map(function(date, index){
					var monthName = views.monthName(date);
					var sorter = m('th.month', views.sortable('$' + monthName), monthName);
					if(index == 0){
						return [
							m('th.month[hasEvent]', {onclick: events.incrementMonths.bind(-1)}, '<'),
							sorter
						];
					}else if(index == (control.numMonths - 1)){
						return [
							sorter,
							m('th.month[hasEvent]', {onclick: events.incrementMonths.bind(1)}, '>')
						];
					}else{
						return sorter;
					}
				})
			]);
		},
		subheaderRow: function(){
			return m('tr.subheaders.inputs', [
				m('th'),
				m('th', 'TOTALS'),
				m('th.number'),
				m('th.number', Deal.allFiltered.reduce(function(sum, deal){
					return sum += (deal.amount || 0);
				}, 0).toDollars()),
				m('th'),
				m('th'),
				control.months.map(function(date, index){
					var colspan = ((index == 0 || index == (control.numMonths - 1)) ? '[colspan=2]' : '');
					var monthName = '$' + views.monthName(date);
					return m('th.number' + colspan, Deal.allFiltered.reduce(function(sum, deal){
						return sum += (deal[monthName] || 0);
					}, 0).toDollars());
				})
			]);
		},
		bodyRow: function(deal, index){
			return m('tr.body[highlight=' + (control.highlights.indexOf(deal.dealId) >= 0 ? true : '') + ']', [
				m('td[highlight-toggle]', {onclick: events.highlight.bind(deal)}, Deal.allFiltered.length - index),
				m('th', [
					m('a[href=https://app.hubspot.com/sales/211554/deal/' + deal.dealId + ']', deal.dealname)
				]),
				m('td.number', deal.probability_),
				m('td.number', deal.amount.toDollars()),
				m('td.number', views.dateIntegerToString(deal.closedate)),
				m('td.number', views.dateIntegerToString(deal.startdate)),
				control.months.map(function(date, index){
					var allocation = deal['$' + views.monthName(date)];
					var colspan = ((index == 0 || index == (control.numMonths - 1)) ? '[colspan=2]' : '');
					return m('td.number' + colspan, (allocation ? allocation.toDollars() : ''));
				})
			]);
		},
		controls: function(){
			return [
				m('p', [
					control.loadStatus.doContinue ? [
						m('span', 'Loading ' + (Deal.all.length || '') + '...'),
						m('button', {onclick: events.stopLoading}, 'Cancel')
					] : [
						m('span', Deal.all.length + ' loaded in memory. ' + (Deal.allFiltered.length || 0) + ' match the current filters.'),
						m('button', {onclick: events.loadDeals}, 'Refresh')
					]
				]),
				m('p.label', [
					m('button', {onclick: events.filter}, 'Filter:'),
					m('input.code', views.input(control.query.value).merge({
						error: (control.query.status ? 1 : 0)
					})),
				]),
				m('p', [
					m('span', 'You can filter on: '),
					m('code', Object.keys(Deal.properties).join(', '))
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
			control.loadStatus = {};
			control.highlights = [];

			control.startMonth = (Date.fromYMD(Location.query().startMonth) || (new Date()).getFirstOfMonth());
			control.numMonths = 4;
			control.months = control.startMonth.throughNMonths(control.numMonths);
		},
		view: function(){
			return [
				m('h1', 'Deals'),
				viewBlocks.controls(),
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
