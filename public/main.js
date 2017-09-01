'use strict';

(function(){

	var Component = (function(){
		var message;

		return {
			oninit: function(){
				m.request({
					url: '/api'
				}).then(function(response){
					if(response.success){
						message = response.message;
					}else{
						message = 'Errare humanum est.';
					}
				});
			},
			view: function(){
				return m('h1', 'The API says: ' + message);
			}
		}
	})();

	document.addEventListener('DOMContentLoaded', function(){
		m.mount(document.getElementById('display'), Component);
	});
})();
