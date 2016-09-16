/**
 * @ngdoc service
 * @name flickrService
 * @module photoStream
 * @description
 * Interface to flickr-related API calls
 */
angular.module('photoStream')
  .factory('flickrService', flickrService);

flickrService.$inject = ['$http', '$q', 'flickrConfig'];

function flickrService($http, $q, flickrConfig) {
  var FLICKR_GET_PHOTOS_URL = 'https://api.flickr.com/services/rest/?method=flickr.people.getPublicPhotos',
      FLICKR_GET_SIZES_URL = 'https://api.flickr.com/services/rest/?method=flickr.photos.getSizes',
      apiProperties = {
        user_id: flickrConfig.USER_ID,
        extras: 'date_upload,views',
        per_page: 30
      };

  return {
    getPhotos: _getPhotos,
    setPageSize: _setPageSize,
  };

  /**
   * @ngdoc method
   * @name flickrService#getPhotos
   * @param {object=} options The additonal options to set to the getPublicPhotos flickr API call
   * @description
   * Fetches and formats the public photos for the NASA flickr stream
   */
  function _getPhotos(options) {
    var photosResponse = null;
    angular.extend(apiProperties, options);

    // use promise chaining to first retrieve public photos, then get sizes for each photo
    return $http({
      method: 'GET',
      url: FLICKR_GET_PHOTOS_URL + _getQueryParams(apiProperties)
    }).then(function(response) {
      // for each photo, add properties for image urls and the url to fetch image sizes
      angular.forEach(response.data.photos.photo, function(photo) {
        photo.urlDefault = 'https://farm' + photo.farm + '.staticflickr.com/' + photo.server + '/' + photo.id + '_' + photo.secret + '.jpg';
        photo.urlLarge = 'https://farm' + photo.farm + '.staticflickr.com/' + photo.server + '/' + photo.id + '_' + photo.secret + '_b.jpg';
        photo.getSizesPromise = _getSizesPromise(photo.id);
      });

      return response;
    }).then(function(response) {
      photosResponse = response;

      // gather all getSizes() $http calls so that they can all be resolve using $q.all
      var allGetSizesPromises = response.data.photos.photo.map(function(photo, index) {
        return photo.getSizesPromise;
      });
      return $q.all(allGetSizesPromises);
    }).then(function() {
      // format the original photos response to include the image dimensions
      var sizeResponses = arguments[0];

      angular.forEach(sizeResponses, function(sizeResponse, index) {
        photosResponse.data.photos.photo[index].sizes = sizeResponse.data.sizes.size;
      });

      // return final photos response object that includes urls, image dimensions, and image src
      return photosResponse;
    });
  }

  // string together query parameters for flickr rest calls
  function _getQueryParams(apiPropertiesObj) {
    var queryParams = '&api_key=' + flickrConfig.API_KEY;

    angular.forEach(apiPropertiesObj, function(paramValue, paramKey) {
      queryParams += '&' + paramKey + '=' + paramValue;
    });
    queryParams += '&format=json&nojsoncallback=1';

    return queryParams;
  }

  // fetches the various dimensions for the photo
  function _getSizesPromise(photoId) {
    return $http({
      method: 'GET',
      cache: true,
      url: FLICKR_GET_SIZES_URL + _getQueryParams({ photo_id: photoId })
    });
  }

  /**
   * @ngdoc method
   * @name flickrService#setPageSize
   * @param {string=} pageSize Determines how many images to fetch
   *    Defaults to fetching 60 images; can be 'sm' (fetches 15 images), 'md' (fecthes 30 images)
   * @description
   * Sets the page size for fetching images from the NASA flickr stream. This can help minimize the payload if the
   * viewport isn't necessarily big enough to display that many photos
   */
  function _setPageSize(pageSize) {
    if (pageSize === 'sm') {
      apiProperties.per_page = 15;
    } else if (pageSize === 'md') {
      apiProperties.per_page = 30;
    } else {
      apiProperties.per_page = 60;
    }
  }
}
