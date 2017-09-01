'use strict';

(function(){

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
			models.isLoading = true;
			m.request({
				url: '/deals'
			}).then(function(response){
				if(response.success){
					models.deals = response.results.results.map(Deal.format);
				}else{
					models.serverResponse = response.message;
				}
				models.isLoading = false;
			});
		}

		var events = {};
		events.loadDeals = function(event){
			actions.loadDeals();
		}

		var models = {
			isLoading: false,
			deals: [],
			serverResponse: ''
		}

		var views = {};
		views.headerRow = function(){
			return m('tr', [
				m('th', ''),
				m('th', 'Created'),
				m('th', 'Name'),
				m('th', 'Probability'),
				m('th', 'Amount'),
				m('th', 'Close date')
			]);
		}
		views.bodyRow = function(deal, index){
			return m('tr', [
				m('th', (models.deals.length - index)),
				m('td', deal.createdate),
				m('td', deal.dealname),
				m('td', deal.probability_),
				m('td', '$'+ deal.amount),
				m('td', deal.closedate)
			]);
		}
		views.listTable = function(){
			return m('table', [
				views.headerRow(),
				models.deals.map(views.bodyRow)
			]);
		}

		return {
			view: function(){
				return [
					m('button', {onclick: events.loadDeals}, 'Load'),
					views.listTable()
				]
			}
		}
	})();

	document.addEventListener('DOMContentLoaded', function(){
		m.mount(document.getElementById('dealsList'), DealsList);
	});
})();
