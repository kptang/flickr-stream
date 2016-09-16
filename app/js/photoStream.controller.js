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
