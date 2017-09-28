'use strict';

m.wrap = function(wrapperNode, wrapperAttributes, list){
	var output = [];
	wrapperAttributes = (wrapperAttributes || {});
	for(var i = 0, l = list.length; i < l; i++){
		output.push(m(wrapperNode, wrapperAttributes, list[i]));
	}
	return output;
}

var _h = {
	query: function(paramsObject){
		var query = m.parseQueryString((window.location.href.match(/\?.*?$/g) || [])[0]);
		var newurl = window.location.origin + window.location.pathname;
		if(paramsObject){
			for(var key in paramsObject){
				query[key] = paramsObject[key];
			}
			newurl += '?' + m.buildQueryString(query);
			window.history.pushState({path: newurl}, '', newurl);
		}
		return query;
	},
	getNestedProperty: function(object, propertyString){
		var propertyTree = propertyString.split('.');
		var currentProperty = null;
		for(var i = 0, l = propertyTree.length; i < l; i++){
			currentProperty = object[propertyTree[i]];
			if(currentProperty === undefined){
				object = {};
			}else{
				object = currentProperty;
			}
		}
		return currentProperty;	
	},
	dollars: function(amount){
		return '$' + amount.toLocaleString(undefined,  {minimumFractionDigits: 2, maximumFractionDigits: 2});
	},
	date: {
		string: function(date, showDays){
			if(!(date instanceof Date)){
				date = new Date(parseInt(date) || 0);
			}
			var delim = '/';
			var year = date.getFullYear();
			var month = date.getMonth() + 1;
			if(showDays){
				return month + delim + date.getDate() + delim + year;
			}else{
				return month + delim + year;
			}
		},
		toObject: function(date){
			return {
				year: date.getFullYear(),
				month: date.getMonth() + 1,
				day: date.getDate()
			}
		},
		fromObject: function(dateObject){
			return (new Date(
				dateObject.year,
				dateObject.month - 1,
				(dateObject.day || 1)
			));
		}
	}
};
