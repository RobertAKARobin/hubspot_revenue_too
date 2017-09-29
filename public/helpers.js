'use strict';

m.wrap = function(wrapperNode, wrapperAttributes, list){
	var output = [];
	wrapperAttributes = (wrapperAttributes || {});
	for(var i = 0, l = list.length; i < l; i++){
		output.push(m(wrapperNode, wrapperAttributes, list[i]));
	}
	return output;
}

Location.query = function(paramsObject){
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
}
Date.fromObject = function(dateObject){
	return (new Date(
		dateObject.year,
		dateObject.month - 1,
		(dateObject.day || 1)
	));
}
Date.prototype.toObject = function(){
	var date = this;
	return {
		year: date.getFullYear(),
		month: date.getMonth() + 1,
		day: date.getDate()
	}
}
Date.prototype.toPrettyString = function(showDays){
	var date = this;
	var delim = '/';
	var year = date.getFullYear();
	var month = date.getMonth() + 1;
	if(showDays){
		return month + delim + date.getDate() + delim + year;
	}else{
		return month + delim + year;
	}
}
Number.prototype.toDollars = function(){
	var amount = this;
	return '$' + amount.toLocaleString(undefined,  {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
Object.defineProperty(Object.prototype, 'merge', {
	enumerable: false,
	value: function(input){
		var object = this;
		return Object.assign(input, JSON.parse(JSON.stringify(object)));
	}
})
