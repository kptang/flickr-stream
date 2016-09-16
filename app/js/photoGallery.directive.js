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
