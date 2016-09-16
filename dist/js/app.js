'use strict';

angular
  .module('photoStream', ['ui.bootstrap', 'photoStream.templates'])
  .constant('flickrConfig', {
      API_KEY: 'a5e95177da353f58113fd60296e1d250',
      USER_ID: '24662369@N07'
  });
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
/**
 * @ngdoc directive
 * @name photoGallery
 * @module photoStream
 * @requires $q
 * @requires $window
 * @requires $uibModal
 * @param {function=} loadMoreFn The function that will run when scrolling to the bottom
 * @param {object} photosPromise The promise for fetching the photos from flickr, should return an array of photos
 *    which will be bound to the directive
 * @param {string=} selectedSort The label describing the type of sort to apply, can be 'Upload Date' or 'Views'
 * @description
 * Shows a grid of photos and reacts to scroll events and sorting events
 */
angular.module('photoStream')
  .directive('photoGallery', photoGallery);

photoGallery.$inject = ['$q', '$window', '$uibModal'];

function photoGallery($q, $window, $uibModal) {
  return {
    restrict: 'E',
    scope: {
      loadMoreFn: '&?',
      photosPromise: '=',
      selectedSort: '@?'
    },
    templateUrl: 'app/js/photoGallery.html',
    link: function(scope, element, attrs) {
      // constants
      var DEFAULT_ROW_HEIGHT = 180,
          sortTypes = {
            UPLOAD_DATE: 'Upload Date',
            VIEWS: 'Views'
          };

      // properties infinite scrolling settings
      var triggerHeight = null, // will be initialized after document is ready
          throttled = false;    // throttle fetching calls when scrolling

      // functions
      scope.viewPhoto = _viewPhoto;

      _activate();

      function _activate() {
        _doLayout();

        // set up listeners for sorting
        scope.$on('sort:upload_date:descending', function() {
          _applySort(sortTypes.UPLOAD_DATE);
          _doLayout();
        });
        scope.$on('sort:views:descending', function() {
          _applySort(sortTypes.VIEWS);
          _doLayout();
        });

        angular.element(document).ready(function() {
          angular.element($window).on('scroll', function() {
            // configure infinite scrolling: when you reach 80% of document height, trigger data fetch
            triggerHeight = document.body.offsetHeight * 0.8;

            if (($window.innerHeight + $window.pageYOffset) >= triggerHeight) {
              if (!throttled) {
                // throttle fetch calls until we're done with this update
                throttled = true;
                // fetch more photos
                scope.loadMoreFn();
                _doLayout(true).then(function() {
                  // allow fetching to continue
                  throttled = false;
                  // update trigger height since more photos have been loaded
                  triggerHeight += document.body.offsetHeight;
                });
              }
            }
          });
        });
      }

      // applies a sorting function to the photos
      function _applySort(sortType) {
        // apply different sorting functions based on the sort type
        if (sortType === sortTypes.UPLOAD_DATE) {
          scope.photos.sort(_sortByUploadDate);
        } else if (sortType === sortTypes.VIEWS) {
          scope.photos.sort(_sortByViews);
        }
        // convert photos array to a promise, since _doLayout() expects that
        scope.photosPromise = $q.resolve(scope.photos);
      }

      // lays out photos in a grid format, with photos taking up the full width of the container
      function _doLayout(append) {
        return scope.photosPromise.then(function(response) {
          // resolve promise and set photos
          if (append) {
            // append the new photos to the existing photos
            var temp = angular.copy(scope.photos);
            scope.photos.length = 0;
            Array.prototype.push.apply(temp, response);
            scope.photos = temp;

            // if a sort is set, then apply that sort to the new array
            if (scope.selectedSort) {
              _applySort(scope.selectedSort);
            }
          } else {
            scope.photos = response;
          }

          angular.element(document).ready(function() {
            // get all <div> image containers (first child is root of template, second child is ng-repeat elements)
            var imgContainers = element.children().children();
            var resizedImages = _getResizedImages(imgContainers);

            var imgContainerStyles = $window.getComputedStyle(imgContainers[0]);
            var margins = (parseInt(imgContainerStyles.marginLeft, 10) || 0) +
                          (parseInt(imgContainerStyles.marginRight, 10) || 0) +
                          (Math.round(parseFloat(imgContainerStyles.borderLeftWidth), 10) || 0) +
                          (Math.round(parseFloat(imgContainerStyles.borderRightWidth), 10) || 0);

            _fillRowWithImages(resizedImages, margins);

            angular.element($window).off('resize');
            angular.element($window).on('resize', function() {
              _fillRowWithImages(resizedImages, margins);
            });
          });
        });
      }

      // given a set of images and their margins, layout the images so that they fill the row
      function _fillRowWithImages(resizedImages, margins) {
        var newRow = {
          images: [],
          width: 0,
          height: DEFAULT_ROW_HEIGHT
        };
        var maxRowWidth = element[0].getBoundingClientRect().width;
        var shrinkRatio = 1,
            totalRows = 1;

        angular.forEach(resizedImages, function(resizedImage) {
          newRow.images.push(resizedImage);
          newRow.width += resizedImage.width + margins;

          if (newRow.width >= maxRowWidth) {
            // determine how much we're over the max row width
            var totalWhiteSpace = newRow.images.length * margins;
            shrinkRatio = (maxRowWidth - totalWhiteSpace) / (newRow.width - totalWhiteSpace);
            // keep images' aspect ratio and shrink row height
            newRow.height = Math.ceil(newRow.height * shrinkRatio);

            // since row height has changed, we need to re-calculate image sizes
            var newRowWidth = 0;
            angular.forEach(newRow.images, function(image, index) {
              var newImageWidth = Math.ceil(image.width * shrinkRatio);
              // account for possible extra margin at the end of the row
              newRowWidth += newImageWidth + margins;
              if (newRowWidth > maxRowWidth) {
                newImageWidth -= (newRowWidth - maxRowWidth);
              }

              // update styles for image container so that image is sized properly
              _updateStyles(image.container, newImageWidth, newRow.height);
            });

            // since we are over the max row height, reset row obj so that calculations start from 0
            newRow = {
              images: [],
              width: 0,
              height: DEFAULT_ROW_HEIGHT
            };

            totalRows++;
          }
        });

        // will also need to resize the last (partial row), to ensure that its height matches the previous row's height
        angular.forEach(newRow.images, function(image) {
          var newImageWidth = Math.floor(image.width * shrinkRatio);
          _updateStyles(image.container, newImageWidth, newRow.height);
        });
      }

      // resize all images in the container so that they fit inside the default row height
      function _getResizedImages(imgContainers) {
        var resizedImages = [];

        angular.forEach(imgContainers, function(imgContainer) {
          // get the ratio of the desired row height vs the image's height
          var ratio = DEFAULT_ROW_HEIGHT/parseInt(imgContainer.getAttribute('data-image-height'), 10);
          // use ratio to keep image's aspect ratio when computing its new width
          var width = parseInt(imgContainer.getAttribute('data-image-width'), 10);
          var newWidth = ratio * width;

          resizedImages.push({
            container: imgContainer,
            width: newWidth
          });
        });

        return resizedImages;
      }

      // sorting comparison function for comparing upload dates
      function _sortByUploadDate(a, b) {
        if (a.dateupload < b.dateupload) {
          return 1;
        } else if (a.dateupload > b.dateupload) {
          return -1;
        }
        return 0;
      }

      // sorting comparison function for comparing image views
      // flickr returns views as a string, so we must convert to integer to do comparisons
      function _sortByViews(a, b) {
        var aViews = parseInt(a.views, 10),
            bViews = parseInt(b.views, 10);

        if (aViews < bViews) {
          return 1;
        } else if (aViews > bViews) {
          return -1;
        }
        return 0;
      }

      // set the width and height of the image container
      function _updateStyles(imageContainer, width, height) {
        imageContainer.style.display = 'block';
        imageContainer.style.height = height + 'px';
        imageContainer.style.width = width + 'px';
      }

      // open a modal to view a larger version of the photo
      function _viewPhoto(image) {
        scope.selectedImage = image;
        $uibModal.open({
          scope: scope,
          size: 'lg',
          template: '<img ng-src="{{selectedImage.urlLarge}}" />'
        });
      }
    }
  }
}
/**
 * @ngdoc controller
 * @name PhotoStreamCtrl
 * @module photoStream
 * @description
 * Interface to flickr-related API calls
 */
angular.module('photoStream')
  .controller('PhotoStreamCtrl', PhotoStreamCtrl);

PhotoStreamCtrl.$inject = ['$scope', '$window', 'flickrService'];

function PhotoStreamCtrl($scope, $window, flickrService) {
  var currentPage = 1,
      stats = {},
      photoCount = 0;

  // scope properties
  $scope.sortTypes = {
    UPLOAD_DATE: 'Upload Date',
    VIEWS: 'Views'
  };
  $scope.selectedSortType = $scope.sortTypes.UPLOAD_DATE;

  // scope functions
  $scope.loadMore = _loadMore;
  $scope.sortPhotos = _sortPhotos;

  _activate();

  function _activate() {
    // get promise that will fetch flickr photos for a specific page; this will be passed to <photo-gallery> directive
    $scope.photosPromise = _getPhotos(currentPage);

    // determine how many photos we should fetch based on the window's innerWidth
    // smaller devices tend to have a smaller width than larger devices
    if ($window.innerWidth < 500) {
      flickrService.setPageSize('sm');
    } else if ($window.innerWidth < 800) {
      flickrService.setPageSize('md');
    }
  }

  // gets the promise for the photos and keeps track of the overall stats for the photo stream, such as current page
  // and total number of photos so far. This way, we can stop making api calls when we have fetched all the photos
  function _getPhotos(page) {
     return flickrService.getPhotos({ page: page })
      .then(function(response) {
        photoCount += response.data.photos.photo.length;
        // for the first call, also record overall stats
        if (currentPage === 1) {
          stats = {
            lastPage: response.data.photos.page,
            totalPhotos: response.data.photos.total
          };
        }
        currentPage++;

        return response.data.photos.photo;
      });
  }

  // only update photo promise if there are more photos to load
  function _loadMore() {
    if (photoCount < stats.totalPhotos) {
      $scope.photosPromise = _getPhotos(currentPage);
    }
  }

  // broadcast the type of sort to other components
  function _sortPhotos(sortType) {
    // only update sort when selecting a sort that's not the current sort type
    if ($scope.selectedSortType !== sortType) {
      $scope.selectedSortType = sortType;
      if (sortType === $scope.sortTypes.UPLOAD_DATE) {
        $scope.$broadcast('sort:upload_date:descending');
      } else if (sortType === $scope.sortTypes.VIEWS) {
        $scope.$broadcast('sort:views:descending');
      }
    }
  }
}
angular.module('photoStream.templates', [])
  .run(['$templateCache', function($templateCache) {
    $templateCache.put('app/js/photoGallery.html',
    '<div id="gallery" class="gallery-container">\n' +
    '  <!-- photo.size[5] maps to the default image dimensions in the sizes array -->\n' +
    '  <div class="image-container" ng-repeat-start="photo in photos track by $index" ng-repeat-end\n' +
    '        data-image-width="{{photo.sizes[5].width}}" data-image-height="{{photo.sizes[5].height}}">\n' +
    '    <img ng-src="{{photo.urlDefault}}" ng-click="viewPhoto(photo)" />\n' +
    '  </div>\n' +
    '</div>\n' +
    '')

  }]);
