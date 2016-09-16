'use strict';

angular
  .module('photoStream', ['ui.bootstrap', 'photoStream.templates'])
  .constant('flickrConfig', {
      API_KEY: 'a5e95177da353f58113fd60296e1d250',
      USER_ID: '24662369@N07'
  });
