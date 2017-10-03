'use strict';

var Deal = (function(){

	var $Class = {
		all: [],
		allById: {},
		allFiltered: [],
		properties: {
			dealname: 'string',
			probability_: 'integer',
			amount: 'float', 
			closedate: 'date',
			schedule: 'string'
		},
		formatFromAPI: {
			float: function(value){
				return (parseFloat(value || 0));
			},
			integer: function(value){
				return (parseInt(value || 0));
			},
			date: function(value){
				value = parseInt(value);
				if(isNaN(value)){
					value = null;
				}else{
					value = new Date(value + (5 * 60 * 60 * 1000));
					value = value.getFullYear() + '/' + value.getMonthWithZeroes() + '/' + value.getDateWithZeroes();
				}
				return value;
			}
		},
		clear: function(){
			Deal.all = [];
			Deal.allById = {};
			Deal.allFiltered = [];
		},
		new: function(){
			var deal = Object.create($Instance);
			deal = $InstanceConstructor.apply(deal, arguments);
			Deal.all.push(deal);
			Deal.allById[deal.dealId] = deal;
			return deal;
		},
		filter: function(callback){
			Deal.allFiltered = [];
			Deal.all.forEach(function(deal){
				if(callback(deal)){
					Deal.allFiltered.push(deal);
				}
			});
			return Deal.allFiltered;
		},
		sortOn: function(sortProperty, sortDirection){
			Deal.allFiltered.sortOn(Deal.properties[sortProperty] != 'string' ? sortProperty : function(deal){
				return deal[sortProperty].toString().toLowerCase().replace(/[^a-zA-Z0-9]/g,'');
			});
			if(sortDirection == 'asc'){
				Deal.allFiltered.reverse();
			}
			return Deal.allFiltered;
		}
	}

	var $InstanceConstructor = function(input){
		var deal = this;
		deal.raw = input;
		deal.dealId = input.dealId;
		deal.updateProperties(input);
		return deal;
	}

	var $Instance = {
		updateProperties: function(input){
			var deal = this;
			for(var propertyName in Deal.properties){
				var value = input.properties[propertyName];
				var type = Deal.properties[propertyName];
				var formatFunction = Deal.formatFromAPI[type];
				value = (value instanceof Object ? value.value : value);
				deal[propertyName] = (formatFunction ? formatFunction.call(null, value) : value);
			}
			return deal;
		},
		updateAllocations: function(){
			var deal = this;
			return deal;
			// var monthlyAllocations = (deal.schedule.match(match.scheduleString) || []);
			// var startDate = new Date(deal.startdate.getTime());
			// deal.monthlyAllocations = {};
			// for(var i = 0, l = monthlyAllocations.length; i < l; i++){
			// 	var monthlyAllocation = monthlyAllocations[i];
			// 	var numericValueForMonth = parseFloat(monthlyAllocation.replace(match.nonNum, ''));
			// 	var dollarValueForMonth = numericValueForMonth;
			// 	if(/%/.test(monthlyAllocation)){
			// 		dollarValueForMonth = (numericValueForMonth * (deal.amount / 100));
			// 	}
			// 	deal.monthlyAllocations[startDate.getTime()] = dollarValueForMonth;
			// 	startDate.setMonth(startDate.getMonth() + 1);
			// }
			// return deal;
		}
	}

	return $Class;

})();
