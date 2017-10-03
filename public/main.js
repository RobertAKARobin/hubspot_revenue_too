'use strict';

var DealsList = (function(){

	var control = {
		sort: {
			activeSortProperty: null,
			directions: {}
		},
		query: {
			value: m.stream(Location.query().query || ''),
			status: undefined
		},
		highlights: [],
		loadStatus: {}
	}

	var action = {
		loadDeals: function(){
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
					action.stopLoading();
				}
			}
		},
		filter: function(){
			var query = control.query.value();
			var deal = {};
			control.query.status = undefined;
			try{
				if(!query) throw new Error();
				eval(query);
				Deal.filter(function(deal){
					var result = eval(query);
					return result;
				});
			}catch(error){
				control.query.status = 'error';
			}
		},
		stopLoading: function(){
			control.loadStatus.doContinue = false;
		}
	}

	var events = {
		highlight: function(event){
			var deal = this;
			var highlightNum = control.highlights.indexOf(deal.dealId);
			if(highlightNum >= 0){
				control.highlights.splice(highlightNum, 1);
			}else{
				control.highlights.push(deal.dealId);
			}
		},
		sort: function(event){
			var sortProperty = this;
			var sortDirection = (control.sort.directions[sortProperty] == 'asc' ? 'desc' : 'asc');
			Deal.sortOn(sortProperty, sortDirection)
			control.sort.directions[sortProperty] = sortDirection;
			control.sort.activeSortProperty = sortProperty;
		},
		updateInput: function(event){
			var stream = this;
			event.redraw = false;
			stream(event.target.value);
		}
	}

	var views = {
		input: function(stream){
			return {
				value: stream(),
				oninput: events.updateInput.bind(stream)
			}
		},
		sortable: function(sortProperty){
			return {
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
				m('th', views.sortable('closedate'), 'Close date')
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
				m('th')
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
				m('td.number', deal.closedate)
			]);
		},
		controls: function(){
			return [
				m('p', [
					control.loadStatus.doContinue ? [
						m('span', 'Loading ' + (Deal.all.length || '') + '...'),
						m('button', {onclick: action.stopLoading}, 'Cancel')
					] : [
						m('span', Deal.all.length + ' loaded in memory. ' + (Deal.allFiltered.length || 0) + ' match the current filters.'),
						m('button', {onclick: action.loadDeals}, 'Refresh')
					]
				]),
				m('p.label', [
					m('button', {onclick: action.filter}, 'Filter:'),
					m('input.code', views.input(control.query.value).merge({
						error: (control.query.status ? 1 : 0)
					})),
				])
			];
		}
	};

	return {
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
