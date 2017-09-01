'use strict';

(function(){

	var help = {}
	help.date = function(input){
		input = parseInt(input);
		if(!input) return false;
		var dateObject = new Date(input);
		var dateString = dateObject.toISOString().split('T')[0].substring(2);
		return m('span', {
			timestamp: dateObject.getTime(),
			title: dateObject.toLocaleString('fullwide', {
				weekday: 'short',
				year: 'numeric',
				month: 'short',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				timeZoneName: 'short'
			})
		}, dateString);
	}

	var Deal = {};
	Deal.format = function(deal){
		var output = {};
		for(var propertyName in deal.properties){
			output[propertyName] = deal.properties[propertyName].value;
		}
		return output;
	}

	var DealsList = (function(){

		var actions = {};
		actions.loadDeals = function(){
			models.deals = [];
			models.loading.continue = true;
			models.loading.offset = null;
			models.loading.total = null;
			loadMore();

			function loadMore(){
				m.request({
					url: '/deals',
					data: {
						count: 100,
						offset: (models.loading.offset || 0)
					}
				}).then(function(response){
					if(response.success && models.loading.continue){
						models.deals = models.deals.concat(response.results.map(Deal.format));
						models.loading.offset = response.offset;
						models.loading.total = response.total;
						models.loading.currently = true;
					}
					if(response.success && response.hasMore && models.loading.continue){
						loadMore();
					}else{
						models.serverResponse = response.message;
						models.loading.currently = false;
						models.loading.continue = false;
					}
				});
			}
		}

		var events = {};
		events.loadDeals = function(event){
			actions.loadDeals();
		}
		events.stopLoading = function(event){
			models.loading.continue = false;
		}
		events.sort = function(propertyName){
			models.sortProperty = propertyName;
			models.sortDirection = (models.sortDirection == 'asc' ? 'desc' : 'asc');
			models.deals.sort(function(a, b){
				var valA = (parseFloat(a[propertyName]) || a[propertyName]);
				var valB = (parseFloat(b[propertyName]) || b[propertyName]);
				if(isNaN(valA) || isNaN(valB)){
					valA = a[propertyName].toString().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
					valB = b[propertyName].toString().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
				}
				if(models.sortDirection == 'asc'){
					return(valA > valB ? 1 : -1)
				}else{
					return(valA < valB ? 1 : -1)
				}
			});
		}

		var models = {
			loading: {
				currently: false,
				continue: false,
				offset: null,
				total: null
			},
			deals: [],
			serverResponse: '',
			sortProperty: '',
			sortDirection: ''
		}

		var views = {};
		views.headerRow = function(){
			return m('tr', [
				m('th', ''),
				m('th', views.sortable('createdate'), 'Created'),
				m('th', views.sortable('dealname'), 'Name'),
				m('th', views.sortable('probability_'), 'Probability'),
				m('th', views.sortable('amount'), 'Amount'),
				m('th', views.sortable('closedate'), 'Close date')
			]);
		}
		views.bodyRow = function(deal, index){
			return m('tr', [
				m('th', (models.deals.length - index)),
				m('td', help.date(deal.createdate)),
				m('td', deal.dealname),
				m('td', deal.probability_),
				m('td', '$'+ deal.amount),
				m('td', help.date(deal.closedate))
			]);
		}
		views.listTable = function(){
			return m('table', [
				views.headerRow(),
				models.deals.map(views.bodyRow)
			]);
		}
		views.sortable = function(propertyName){
			return {
				sort_property: propertyName,
				sorting: (propertyName == models.sortProperty ? models.sortDirection : ''),
				onclick: m.withAttr('sort_property', events.sort),
			}
		}
		views.controls = function(){
			var output = [];
			if(models.loading.continue){
				output.push(m('button', {onclick: events.stopLoading}, 'Cancel'));
			}else{
				output.push(m('button', {onclick: events.loadDeals}, 'Load'));
			}
			if(models.loading.total !== null){
				output.push(m('span', 'Showing ' + models.loading.offset + ' of ' + models.loading.total));
			}
			return output;
		}

		return {
			view: function(){
				return [
					views.controls(),
					views.listTable()
				]
			}
		}
	})();

	document.addEventListener('DOMContentLoaded', function(){
		m.mount(document.getElementById('dealsList'), DealsList);
	});
})();
