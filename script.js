// --- Configuration ---
const GOOGLE_MAPS_API_KEY = 'AIzaSyDQ_5uHz0b3cFKVzg8nKy0RGT2FgDH-Mj4'; // <<< IMPORTANT: REPLACE THIS WITH YOUR ACTUAL API KEY
const PRICE_PER_MILE = 1.70; // $1.70 per mile

// --- DOM Elements (General) ---
const bookingForm = document.getElementById('bookingForm');
const customerNameInput = document.getElementById('customerName');
const pickupDateInput = document.getElementById('pickupDate');
const pickupTimeInput = document.getElementById('pickupTime');
const phoneNumberInput = document.getElementById('phoneNumber');
const requestRideButton = document.getElementById('requestRide');
const resultDiv = document.getElementById('result');
const totalPriceDisplay = document.getElementById('totalPrice');
const priceLabel = document.querySelector('.price-label');
const confirmationMessage = document.getElementById('confirmationMessage');
const payWithStripeButton = document.getElementById('payWithStripe');
const payLaterButton = document.getElementById('payLater');
const stripeMessageDiv = document.getElementById('stripeMessage');
const payLaterMessageDiv = document.getElementById('payLaterMessage');

// Detailed Address Fields (within the containers) - these are always present
const pickupStreetInput = document.getElementById('pickupStreet');
const pickupAptInput = document.getElementById('pickupApt');
const pickupCityInput = document.getElementById('pickupCity');
const pickupStateInput = document.getElementById('pickupState');
const pickupZipInput = document.getElementById('pickupZip');
const pickupAddressDisplay = document.getElementById('pickupAddressDisplay');

const dropoffStreetInput = document.getElementById('dropoffStreet');
const dropoffAptInput = document.getElementById('dropoffApt');
const dropoffCityInput = document.getElementById('dropoffCity');
const dropoffStateInput = document.getElementById('dropoffState');
const dropoffZipInput = document.getElementById('dropoffZip');
const dropoffAddressDisplay = document.getElementById('dropoffAddressDisplay');

// Hidden fields for calculated price and full addresses
const estimatedPriceInput = document.getElementById('estimatedPrice');
const fullPickupAddressInput = document.getElementById('fullPickupAddress');
const fullDropoffAddressInput = document.getElementById('fullDropoffAddress');

let currentCalculatedPrice = 0;
let isPriceCalculated = 0; // Changed to 0 for initial state, 1 for calculated, 2 for confirmed

// --- Functions ---

// Function to load Google Maps API script dynamically
function loadGoogleMapsScript() {
    if (window.google && window.google.maps && window.google.maps.places) {
        console.log('Google Maps API and Places library already loaded.');
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&callback=initMap`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script  );

        script.onload = () => {
            console.log('Google Maps API script loaded.');
        };
        window.initMap = () => {
            console.log('Google Maps API initialized successfully.');
            window.initPlaceAutocompleteElements();
            resolve();
        };
        script.onerror = () => {
            console.error('Failed to load Google Maps API script.');
            reject(new Error('Google Maps API failed to load.'));
        };
    });
}

// Helper function to fill in address fields from Google Places result
function fillInAddress(place, prefix) {
    document.getElementById(`${prefix}Street`).value = '';
    document.getElementById(`${prefix}City`).value = '';
    document.getElementById(`${prefix}State`).value = '';
    document.getElementById(`${prefix}Zip`).value = '';
    document.getElementById(`${prefix}Apt`).value = '';

    let streetNumber = '';
    let route = '';

    for (const component of place.address_components) {
        const componentType = component.types[0];

        switch (componentType) {
            case 'street_number':
                streetNumber = component.long_name;
                break;
            case 'route':
                route = component.long_name;
                break;
            case 'locality':
                document.getElementById(`${prefix}City`).value = component.long_name;
                break;
            case 'administrative_area_level_1':
                document.getElementById(`${prefix}State`).value = component.short_name;
                break;
            case 'postal_code':
                document.getElementById(`${prefix}Zip`).value = component.long_name;
                break;
        }
    }
    document.getElementById(`${prefix}Street`).value = streetNumber + ' ' + route;

    const fullAddress = place.formatted_address || `${streetNumber} ${route}, ${document.getElementById(`${prefix}City`).value}, ${document.getElementById(`${prefix}State`).value} ${document.getElementById(`${prefix}Zip`).value}`;
    document.getElementById(`${prefix}AddressDisplay`).value = fullAddress;
}

// Function to format phone number as (123) 456-7890
function formatPhoneNumber(value) {
    if (!value) return "";
    value = value.replace(/\D/g, '');
    value = value.substring(0, 10);

    let formattedValue = '';
    if (value.length > 0) {
        formattedValue += '(' + value.substring(0, 3);
    }
    if (value.length >= 4) {
        formattedValue += ') ' + value.substring(3, 6);
    }
    if (value.length >= 7) {
        formattedValue += '-' + value.substring(6, 10);
    }
    return formattedValue;
}

// Function to perform the distance calculation and display price
async function calculateAndDisplayPrice() {
    const origin = `${pickupStreetInput.value.trim()} ${pickupAptInput.value.trim()} ${pickupCityInput.value.trim()}, ${pickupStateInput.value.trim()} ${pickupZipInput.value.trim()}`.trim();
    const destination = `${dropoffStreetInput.value.trim()} ${dropoffAptInput.value.trim()} ${dropoffCityInput.value.trim()}, ${dropoffStateInput.value.trim()} ${dropoffZipInput.value.trim()}`.trim();

    const phoneNumber = phoneNumberInput.value.trim();
    const customerName = customerNameInput.value.trim();
    const pickupDate = pickupDateInput.value;
    const pickupTime = pickupTimeInput.value;

    resultDiv.classList.add('hidden');
    stripeMessageDiv.classList.add('hidden');
    payLaterMessageDiv.classList.add('hidden');
    totalPriceDisplay.textContent = '';
    confirmationMessage.textContent = '';
    priceLabel.classList.add('hidden');

    if (!customerName || !pickupDate || !pickupTime || !pickupStreetInput.value.trim() || !pickupCityInput.value.trim() || !pickupStateInput.value.trim() || !pickupZipInput.value.trim() || !dropoffStreetInput.value.trim() || !dropoffCityInput.value.trim() || !dropoffStateInput.value.trim() || !dropoffZipInput.value.trim() || !phoneNumber) {
        alert('Please fill in all required fields: Your Name, Pickup Date, Pickup Time, Pickup Street, City, State, Zip, Drop-off Street, City, State, Zip, and Phone Number.');
        requestRideButton.textContent = 'BOOK-A-RIDE';
        requestRideButton.disabled = false;
        return;
    }

    requestRideButton.textContent = 'Calculating...';
    requestRideButton.disabled = true;

    try {
        await loadGoogleMapsScript();

        const service = new google.maps.DistanceMatrixService();
        service.getDistanceMatrix(
            {
                origins: [origin],
                destinations: [destination],
                travelMode: google.maps.TravelMode.DRIVING,
                unitSystem: google.maps.UnitSystem.IMPERIAL,
            },
            (response, status) => {
                if (status === 'OK' && response.rows[0].elements[0].status === 'OK') {
                    const distanceMiles = response.rows[0].elements[0].distance.value / 1609.34;
                    const price = distanceMiles * PRICE_PER_MILE;
                    currentCalculatedPrice = price;

                    totalPriceDisplay.textContent = `$${price.toFixed(2)}`;
                    priceLabel.classList.remove('hidden');
                    totalPriceDisplay.classList.remove('hidden');

                    requestRideButton.textContent = 'CONFIRM RIDE & VIEW PAYMENT';
                    isPriceCalculated = 1;

                    estimatedPriceInput.value = price.toFixed(2);
                    fullPickupAddressInput.value = pickupAddressDisplay.value;
                    fullDropoffAddressInput.value = dropoffAddressDisplay.value;

                    console.log('Ride Request Details:');
                    console.log('Customer Name:', customerName);
                    console.log('Pickup Date:', pickupDate);
                    console.log('Pickup Time:', pickupTime);
                    console.log('Pickup:', origin);
                    console.log('Drop-off:', destination);
                    console.log('Phone:', phoneNumber);
                    console.log('Estimated Price:', `$${price.toFixed(2)}`);

                } else {
                    alert('Could not calculate distance. Please check addresses or try again later. Status: ' + status);
                    console.error('Distance Matrix Error:', response);
                    isPriceCalculated = 0;
                    priceLabel.classList.add('hidden');
                    totalPriceDisplay.classList.add('hidden');
                }
                requestRideButton.disabled = false;
            }
        );
    } catch (error) {
        console.error('Error during ride request:', error);
        alert('An error occurred while processing your request. Please try again.');
        isPriceCalculated = 0;
        priceLabel.classList.add('hidden');
        totalPriceDisplay.classList.add('hidden');
        requestRideButton.textContent = 'BOOK-A-RIDE';
        requestRideButton.disabled = false;
    }
}

// --- Event Listeners ---

phoneNumberInput.addEventListener('input', (e) => {
    const newFormattedValue = formatPhoneNumber(e.target.value);
    e.target.value = newFormattedValue;
    e.target.selectionStart = e.target.selectionEnd = newFormattedValue.length;
});

requestRideButton.addEventListener('click', () => {
    if (isPriceCalculated === 0) {
        calculateAndDisplayPrice();
    } else if (isPriceCalculated === 1) {
        resultDiv.classList.remove('hidden');
        confirmationMessage.textContent = 'Your ride request is ready!';
        requestRideButton.classList.add('hidden');
        isPriceCalculated = 2;
    }
});

payWithStripeButton.addEventListener('click', () => {
    resultDiv.classList.add('hidden');
    payLaterMessageDiv.classList.add('hidden');
    stripeMessageDiv.classList.remove('hidden');
});

payLaterButton.addEventListener('click', () => {
    resultDiv.classList.add('hidden');
    stripeMessageDiv.classList.add('hidden');
    payLaterMessageDiv.classList.remove('hidden');

    // Submit the form to Formspree
    bookingForm.submit();
});

const inputFields = [
    customerNameInput,
    pickupDateInput,
    pickupTimeInput,
    pickupStreetInput,
    pickupAptInput,
    pickupCityInput,
    pickupStateInput,
    pickupZipInput,
    dropoffStreetInput,
    dropoffAptInput,
    dropoffCityInput,
    dropoffStateInput,
    dropoffZipInput,
    phoneNumberInput
];

inputFields.forEach(input => {
    input.addEventListener('input', () => {
        if (isPriceCalculated > 0) {
            isPriceCalculated = 0;
            resultDiv.classList.add('hidden');
            priceLabel.classList.add('hidden');
            totalPriceDisplay.classList.add('hidden');
            requestRideButton.classList.remove('hidden');
            requestRideButton.textContent = 'BOOK-A-RIDE';
            stripeMessageDiv.classList.add('hidden');
            payLaterMessageDiv.classList.add('hidden');
        }
    });
});

window.addEventListener('DOMContentLoaded', () => {
    const pickupAddressDetails = document.getElementById('pickupAddressDetails');
    const dropoffAddressDetails = document.getElementById('dropoffAddressDetails');

    console.log('DOMContentLoaded fired. Attempting to find elements...');
    console.log('pickupAddressDisplay element found:', pickupAddressDisplay);
    console.log('dropoffAddressDisplay element found:', dropoffAddressDisplay);

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    pickupDateInput.value = `${year}-${month}-${day}`;

    const currentHour = today.getHours();
    const currentMinute = today.getMinutes();
    let defaultHour = currentHour;
    let defaultMinute = 0;

    if (currentMinute >= 45) {
        defaultHour = (currentHour + 1) % 24;
        defaultMinute = 0;
    } else if (currentMinute >= 30) {
        defaultMinute = 45;
    } else if (currentMinute >= 15) {
        defaultMinute = 30;
    } else {
        defaultMinute = 15;
    }

    const defaultTime = `${String(defaultHour).padStart(2, '0')}:${String(defaultMinute).padStart(2, '0')}`;
    pickupTimeInput.value = defaultTime;

    if (pickupAddressDisplay) {
        pickupAddressDisplay.addEventListener('click', () => {
            console.log('Pickup Address Display clicked!');
            if (pickupAddressDetails) {
                pickupAddressDetails.classList.remove('hidden');
                pickupAddressDetails.classList.add('visible');
                pickupStreetInput.focus();
            } else {
                console.error('Error: pickupAddressDetails element not found for click listener.');
            }
        });
    } else {
        console.error('Error: pickupAddressDisplay element not found for click listener after DOMContentLoaded.');
    }

    if (dropoffAddressDisplay) {
        dropoffAddressDisplay.addEventListener('click', () => {
            console.log('Drop-off Address Display clicked!');
            if (dropoffAddressDetails) {
                dropoffAddressDetails.classList.remove('hidden');
                dropoffAddressDetails.classList.add('visible');
                dropoffStreetInput.focus();
            } else {
                console.error('Error: dropoffAddressDetails element not found for click listener.');
            }
        });
    } else {
        console.error('Error: dropoffAddressDisplay element not found for click listener after DOMContentLoaded.');
    }

    loadGoogleMapsScript();
});

window.initPlaceAutocompleteElements = function() {
    console.log('Initializing Google Place Autocomplete (traditional method)...');

    // Removed 'fields' property from the constructor
    const pickupAutocomplete = new google.maps.places.Autocomplete(pickupStreetInput, {
        types: ['address'],
        componentRestrictions: { country: 'us' }
    });

    pickupAutocomplete.addListener('place_changed', () => {
        const place = pickupAutocomplete.getPlace();
        if (place) {
            fillInAddress(place, 'pickup');
        } else {
            console.log("No place selected for pickup.");
        }
    });

    // Removed 'fields' property from the constructor
    const dropoffAutocomplete = new google.maps.places.Autocomplete(dropoffStreetInput, {
        types: ['address'],
        componentRestrictions: { country: 'us' }
    });

    dropoffAutocomplete.addListener('place_changed', () => {
        const place = dropoffAutocomplete.getPlace();
        if (place) {
            fillInAddress(place, 'dropoff');
        } else {
            console.log("No place selected for dropoff.");
        }
    });
    console.log('Google Place Autocomplete initialized.');
};
