function loadData() {
    var $wikiElem = $('#wikipedia-links');

// clear out old data before new request
    $wikiElem.text("");

    // load wikipedia data

    var wikiUrl = 'http://en.wikipedia.org/w/api.php?action=opensearch&search=' + self.name + '&format=json&callback=wikiCallback';
    var wikiRequestTimeout = setTimeout(function () {
        $wikiElem.text("failed to get wikipedia resources");
    }, 8000);

    $.ajax({
        url: wikiUrl,
        dataType: "jsonp",
        jsonp: "callback",
        success: function (response) {
            var articleList = response[1];

            for (var i = 0; i < articleList.length; i++) {
                articleStr = articleList[i];
                var url = 'http://en.wikipedia.org/wiki/' + articleStr;
                $wikiElem.append('<li><a href="' + url + '">' + articleStr + '</a></li>');
            }

            clearTimeout(wikiRequestTimeout);
        }
    });
}


// Helper function for taking focus away from textbox on iOS devices
function hideIOSKeyboard() {
    document.activeElement.blur();
    $("input").blur();
}

// Object representing a metro station
function MetroStations(dataObj) {
    var self = this;
    self.name = dataObj.name;
    self.line = dataObj.line;
    self.url = dataObj.url;
    self.opened = dataObj.opened;
    self.latitude = parseFloat(dataObj.latitude);
    self.longitude = parseFloat(dataObj.longitude);
    self.flickrContent = null;

    // Create the map marker for this MetroStations object
    self.mapMarker = new google.maps.Marker({
        position: {lat: self.latitude, lng: self.longitude},
        map: map,
        title: self.name,
        icon: 'images/metro-logo.png'
    });

    // Create the info window for this MetroStations object
    self.infoWindow = new google.maps.InfoWindow();

    // Shows the info window, building content first if necessary
    self.showInfoWindow = function () {
        // Build the basic info window content, if hasn't been done
        if (!self.infoWindow.getContent()) {
            // Initialize basic info window content and display it
            self.infoWindow.setContent('Loading content...');
            var content = '<h3 class="info-title">' + self.name + '</h3>';
            content += '<p class="info-subtitle">Lat/Long: ' + self.latitude + ' - ' +
                self.longitude + '</p>';
            content += '<p class="info-route-list">Opened: ';
            content += '<span class="info-routes">' + self.opened +
                '</span></p>';
            content += '<a class="wikiLink" href="' +
                self.url + '" target="_blank">Wiki Info ' + '<i class="fa fa-wikipedia-w"></i>' + '</a>'
            self.infoWindow.setContent(content);
        }

        // Build the Flickr content for the info window, if hasn't been done
        if (!self.flickrContent) {
            // Use Flickr API to retrieve photos related to the location,
            // then display the data using a callback function
            flickr.getPhotos(self.latitude, self.longitude, function (results) {
                var content = '<div class="flickr-box">';
                content += '<h3 class="flickr-headline">Area Photos</h3>';
                results.forEach(function (info) {
                    content += '<a class="flickr-thumb" href="' +
                        info.photoPage + '" target="_blank">' + '<img src="' +
                        info.imgThumbUrl + '"></a>';
                });
                content += '</div>';
                self.flickrContent = content;
                var allContent = self.infoWindow.getContent() + content;
                self.infoWindow.setContent(allContent);
            });
        }

        // Show info window
        self.infoWindow.open(map, self.mapMarker);
    };

    // Enables marker bounce animation and shows the info window. If another
    // MetroStations object is active, it is deactivated first, since only one
    // object can be active at a time. This prevents UI clutter.
    self.activate = function () {
        // Check the variable that references the currently active
        // MetroStations object. If the value is not null and it doesn't point
        // to this object, then run its deactivate method.
        if (MetroStations.prototype.active) {
            if (MetroStations.prototype.active !== self) {
                MetroStations.prototype.active.deactivate();
            }
        }

        // Enable marker bounce animation and show info window
        self.mapMarker.setAnimation(google.maps.Animation.BOUNCE);
        self.showInfoWindow();

        // Set this MetroStations object as the active one
        MetroStations.prototype.active = self;
    };

    // Disables marker bounce animation and closes the info window
    self.deactivate = function () {
        // Disable marker bounce and close info window
        self.mapMarker.setAnimation(null);
        self.infoWindow.close();

        // Since this object is being deactivated, the class variable which
        // holds the reference to the active object is set to null
        MetroStations.prototype.active = null;
    };

    // Centers the map on the requested location, then activates this
    // MetroStations object. This fires when a listview item is clicked,
    // via Knockout.
    self.focus = function () {
        map.panTo({lat: self.latitude, lng: self.longitude});
        self.activate();
    };

    // Toggles the active state of this MetroStations object. This is the
    // callback for the marker's click event.
    self.mapMarkerClickHandler = function () {
        // If currently active (marker bouncing, info window visible),
        // deactivate. Otherwise, activate.
        if (MetroStations.prototype.active === self) {
            self.deactivate();
        } else {
            self.activate();
        }

        // Remove focus from filter textbox when marker is clicked (on iOS)
        hideIOSKeyboard();
    };

    // Deactivates this MetroStations object when the info marker's close
    // button is clicked
    self.infoWindowCloseClickHandler = function () {
        self.deactivate();
    };

    // Sets mapMarkerClickHandler as the click callback for the map marker
    self.mapMarker.addListener('click', self.mapMarkerClickHandler);

    // Sets infoWindowCloseClickHandler as the click callback for the info
    // window's close button
    self.infoWindow.addListener('closeclick', self.infoWindowCloseClickHandler);
}

// Static class variable that stores the active MetroStations object. The
// active MetroStations is the one with a visible info window.
MetroStations.prototype.active = null;


// Main list view
function ListViewModel() {
    var self = this;
    self.stations = ko.observableArray([]);
    self.filter = ko.observable('');
    self.loadingMsg = ko.observable('Loading metro stations...');
    self.isVisible = ko.observable(true);

    // Update the list contents whenever the filter is modified. Also toggles
    // map marker visibility depending on the filter results.
    self.filterResults = ko.computed(function () {
        var matches = [];
        // Create a regular expression for performing a case-insensitive
        // search using the current value of the filter observable
        var re = new RegExp(self.filter(), 'i');

        // Iterate over all stations objects, searching for a matching name
        self.stations().forEach(function (station) {
            // If it's a match, save it to the list of matches and show its
            // corresponding map marker
            if (station.name.search(re) !== -1) {
                matches.push(station);
                station.mapMarker.setVisible(true);
                // Otherwise, ensure the corresponding map marker is hidden
            } else {
                // Hide marker
                station.mapMarker.setVisible(false);

                // If this station is active (info window is open), then
                // deactivate it
                if (MetroStations.prototype.active === station) {
                    station.deactivate();
                }
            }
        });

        return matches;
    });

    // Show/hide the list when the toggle button is clicked
    self.toggleVisibility = function () {
        self.isVisible(!self.isVisible());
    };

    // This fires when a list item is clicked
    self.clickHandler = function (station) {
        // Hide the list if the viewing area is small
        if (window.innerWidth < 1024) {
            self.isVisible(false);
        }

        // Show the station's map marker and info window
        station.focus();
    };

    // Initialize the array of MetroStations objects asynchronously
    var jsonUrl = 'js/metro.json';
    $.getJSON(jsonUrl, function (data) {
        var stations = [];
        var station;
        var bounds = new google.maps.LatLngBounds();
        data.stations.forEach(function (dataObj) {
            // Create MetroStations object and append it to the stations array
            station = new MetroStations(dataObj);
            stations.push(station);

            // Extend the bounds to include this metro station's location
            bounds.extend(station.mapMarker.position);
        });

        // Update the stations observable array
        self.stations(stations);

        // Instruct the map to resize itself to display all markers in the
        // bounds object
        map.fitBounds(bounds);

        // Set the loading message to null, effectively hiding it
        self.loadingMsg(null);
    }).fail(function () {
        self.loadingMsg('Unable to load data... try refreshing');
        console.log('ERROR: Could not acquire metro station data');
    });
}


// Callback that initializes the Google Map object and activates Knockout
function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 11,
        center: {lat: 48.859766, lng: 2.341968},
        disableDefaultUI: true
    });

    // Ensure focus is taken away from textbox when map is touched (on iOS)
    map.addListener('click', function () {
        hideIOSKeyboard();
    });

    // Activate Knockout once the map is initialized
    ko.applyBindings(new ListViewModel());


}


// This fires if there's an issue loading the Google Maps API script
function initMapLoadError() {
    alert('Failed to initialize the Google Maps API');
    console.log('Failed to initialize Google Maps API');
}


// Google Map object
var map;

$('#form-container').submit(loadData);