// --- Configuration ---
const GOOGLE_MAPS_API_KEY = 'AIzaSyDQ_5uHz0b3cFKVzg8nKy0RGT2FgDH-Mj4'; // Your actual API Key
const PRICE_PER_MILE = 1.70; // $1.70 per mile

// Global variable to store the calculated price
let currentCalculatedPrice = 0;
// 0: Initial state (needs calculation)
// 1: Price calculated (ready for confirmation/submission)
// 2: Form submitted (confirmation message displayed)
let isPriceCalculated = 0;

// Global flags to track if autocomplete has been initialized for each input
let pickupAutocompleteInitialized = false;
let dropoffAutocompleteInitialized = false;

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

// These elements are now hidden/removed from UI, but kept in JS for reference if needed
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
const pickupAddressDisplay = document.getElementById('pickupAddressDisplay'); // This is the display field that expands

const dropoffStreetInput = document.getElementById('dropoffStreet');
const dropoffAptInput = document.getElementById('dropoffApt');
const dropoffCityInput = document.getElementById('dropoffCity');
const dropoffStateInput = document.getElementById('dropoffState');
const dropoffZipInput = document.getElementById('dropoffZip');
const dropoffAddressDisplay = document.getElementById('dropoffAddressDisplay'); // This is the display field that expands

// Hidden fields for calculated price and full addresses (for Formspree)
const estimatedPriceInput = document.getElementById('estimatedPrice');
const fullPickupAddressInput = document.getElementById('fullPickupAddress');
const fullDropoffAddressInput = document.getElementById('fullDropoffAddress');

// --- Functions ---

// Function to load Google Maps API script dynamically
function loadGoogleMapsScript() {
    if (window.google && window.google.maps) { // Check for google.maps, places library will be loaded by callback
        console.log('Google Maps API already loaded.');
        // If already loaded, ensure initMap is called if it hasn't been
        if (typeof window.initMap === 'function') {
            window.initMap();
        }
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&callback=initMap`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script );

        window.initMap = () => { // Define initMap globally for the callback
            console.log('Google Maps API initialized successfully.');
            // Autocomplete initialization is now handled when inputs are revealed
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
    // document.getElementById(`${prefix}Apt`).value = ''; // Apt is manually entered

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
    document.getElementById(`${prefix}Street`).value = (streetNumber + ' ' + route).trim();

    // Update the hidden full address fields for Formspree
    const fullAddress = place.formatted_address || `${(streetNumber + ' ' + route).trim()}, ${document.getElementById(`${prefix}City`).value}, ${document.getElementById(`${prefix}State`).value} ${document.getElementById(`${prefix}Zip`).value}`;
    if (prefix === 'pickup') {
        fullPickupAddressInput.value = fullAddress;
    } else {
        fullDropoffAddressInput.value = fullAddress;
    }
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

// Function to initialize Autocomplete for a specific input
function initializeAutocompleteForInput(inputElement, prefix) {
    if (prefix === 'pickup' && pickupAutocompleteInitialized) return;
    if (prefix === 'dropoff' && dropoffAutocompleteInitialized) return;

    console.log(`Initializing Google Place Autocomplete for ${prefix}StreetInput...`);

    const autocomplete = new google.maps.places.Autocomplete(inputElement, {
        types: ['address'],
        componentRestrictions: { country: 'us' }
    });

    autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place) {
            fillInAddress(place, prefix);
        } else {
            console.log(`No place selected for ${prefix}.`);
        }
    });

    if (prefix === 'pickup') pickupAutocompleteInitialized = true;
    if (prefix === 'dropoff') dropoffAutocompleteInitialized = true;
    console.log(`Google Place Autocomplete initialized for ${prefix}StreetInput.`);
}


// Function to perform the distance calculation and display price
async function calculatePriceAndPrepareConfirmation() {
    const origin = `${pickupStreetInput.value.trim()} ${pickupAptInput.value.trim()} ${pickupCityInput.value.trim()}, ${pickupStateInput.value.trim()} ${pickupZipInput.value.trim()}`.trim();
    const destination = `${dropoffStreetInput.value.trim()} ${dropoffAptInput.value.trim()} ${dropoffCityInput.value.trim()}, ${dropoffStateInput.value.trim()} ${dropoffZipInput.value.trim()}`.trim();

    const phoneNumber = phoneNumberInput.value.trim();
    const customerName = customerNameInput.value.trim();
    const pickupDate = pickupDateInput.value;
    const pickupTime = pickupTimeInput.value;

    // Clear previous messages/displays
    resultDiv.classList.add('hidden');
    stripeMessageDiv.classList.add('hidden');
    payLaterMessageDiv.classList.add('hidden');
    totalPriceDisplay.textContent = '';
    confirmationMessage.textContent = '';
    priceLabel.classList.add('hidden');
    requestRideButton.classList.remove('hidden'); // Ensure button is visible

    // Basic validation
    if (!customerName || !pickupDate || !pickupTime || !pickupStreetInput.value.trim() || !pickupCityInput.value.trim() || !pickupStateInput.value.trim() || !pickupZipInput.value.trim() || !dropoffStreetInput.value.trim() || !dropoffCityInput.value.trim() || !dropoffStateInput.value.trim() || !dropoffZipInput.value.trim() || !phoneNumber) {
        alert('Please fill in all required fields: Your Name, Pickup Date, Pickup Time, Pickup Street, City, State, Zip, Drop-off Street, City, State, Zip, and Phone Number.');
        requestRideButton.textContent = 'BOOK-A-RIDE'; // Reset button text
        requestRideButton.disabled = false;
        isPriceCalculated = 0; // Reset state
        return;
    }

    requestRideButton.textContent = 'Calculating...';
    requestRideButton.disabled = true;

    try {
        // Ensure Google Maps API is loaded before using services
        await loadGoogleMapsScript();

        // Initialize DistanceMatrixService here, as it depends on google.maps being loaded
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
                    resultDiv.classList.remove('hidden'); // Show the price display container

                    // --- UPDATED BUTTON TEXT ---
                    requestRideButton.textContent = 'Confirm Ride';
                    isPriceCalculated = 1; // Price is now calculated

                    estimatedPriceInput.value = price.toFixed(2); // Set hidden input for Formspree

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
                    isPriceCalculated = 0; // Reset state on error
                    priceLabel.classList.add('hidden');
                    totalPriceDisplay.classList.add('hidden');
                    resultDiv.classList.add('hidden');
                    requestRideButton.textContent = 'BOOK-A-RIDE'; // Reset button text
                }
                requestRideButton.disabled = false; // Re-enable button
            }
        );
    } catch (error) {
        console.error('Error during ride request:', error);
        alert('An error occurred while processing your request. Please try again.');
        isPriceCalculated = 0; // Reset state on error
        priceLabel.classList.add('hidden');
        totalPriceDisplay.classList.add('hidden');
        resultDiv.classList.add('hidden');
        requestRideButton.textContent = 'BOOK-A-RIDE'; // Reset button text
        requestRideButton.disabled = false;
    }
}

// --- Event Listeners ---

// Phone number formatting
phoneNumberInput.addEventListener('input', (e) => {
    const newFormattedValue = formatPhoneNumber(e.target.value);
    e.target.value = newFormattedValue;
    // Keep cursor at the end
    e.target.selectionStart = e.target.selectionEnd = newFormattedValue.length;
});

// Main Request Ride Button Logic
requestRideButton.addEventListener('click', () => {
    if (isPriceCalculated === 0) {
        // First click: Calculate price
        calculatePriceAndPrepareConfirmation();
    } else if (isPriceCalculated === 1) {
        // Second click: Submit form and show final confirmation message
        bookingForm.submit(); // Submit the form to Formspree

        // Hide price display and other messages
        resultDiv.classList.add('hidden');
        // The following are now hidden by HTML/CSS, but good to keep for robustness
        if (stripeMessageDiv) stripeMessageDiv.classList.add('hidden');
        if (payLaterMessageDiv) payLaterMessageDiv.classList.add('hidden');

        // --- UPDATED CONFIRMATION MESSAGE ---
        confirmationMessage.textContent = 'A Confirmation Text will be sent shortly with Payment Options';
        confirmationMessage.classList.remove('hidden');

        requestRideButton.classList.add('hidden'); // Hide the button after submission
        isPriceCalculated = 2; // Set to final submitted state
    }
});

// --- COMMENTED OUT: Old Stripe and Pay Later button logic ---
// These event listeners are no longer needed as the main button handles submission
// and the payment link is sent manually by the driver.
/*
if (payWithStripeButton) {
    payWithStripeButton.addEventListener('click', () => {
        resultDiv.classList.add('hidden');
        if (payLaterMessageDiv) payLaterMessageDiv.classList.add('hidden');
        if (stripeMessageDiv) stripeMessageDiv.classList.remove('hidden');
        bookingForm.submit(); // Submit the form to Formspree
    });
}

if (payLaterButton) {
    payLaterButton.addEventListener('click', () => {
        resultDiv.classList.add('hidden');
        if (stripeMessageDiv) stripeMessageDiv.classList.add('hidden');
        if (payLaterMessageDiv) payLaterMessageDiv.classList.remove('hidden');
        bookingForm.submit(); // Submit the form to Formspree
    });
}
*/

// Reset state if any input field changes after price calculation
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
        if (isPriceCalculated > 0) { // If price was calculated or submitted
            isPriceCalculated = 0; // Reset to initial state
            resultDiv.classList.add('hidden');
            priceLabel.classList.add('hidden');
            totalPriceDisplay.classList.add('hidden');
            requestRideButton.classList.remove('hidden'); // Show button
            requestRideButton.textContent = 'BOOK-A-RIDE'; // Reset button text
            if (stripeMessageDiv) stripeMessageDiv.classList.add('hidden');
            if (payLaterMessageDiv) payLaterMessageDiv.classList.add('hidden');
            confirmationMessage.classList.add('hidden'); // Hide confirmation message
        }
    });
});

// --- Initial Setup on DOM Load ---
window.addEventListener('DOMContentLoaded', () => {
    // These are the containers for the detailed address inputs, not the display fields
    const pickupAddressDetails = document.getElementById('pickupAddressDetails'); // Corrected ID
    const dropoffAddressDetails = document.getElementById('dropoffAddressDetails'); // Corrected ID

    // Event listeners for the display fields to show detailed inputs
    if (pickupAddressDisplay) {
        pickupAddressDisplay.addEventListener('click', () => {
            if (pickupAddressDetails) {
                pickupAddressDetails.classList.remove('hidden');
                pickupAddressDetails.classList.add('visible'); // Ensure it becomes visible
                pickupAddressDisplay.classList.add('hidden'); // Hide the display field
                pickupStreetInput.focus();
                // Initialize autocomplete when the input becomes visible
                if (window.google && window.google.maps && window.google.maps.places) {
                    initializeAutocompleteForInput(pickupStreetInput, 'pickup');
                } else {
                    console.warn('Google Maps Places library not yet loaded for autocomplete initialization.');
                }
            } else {
                console.error('Error: pickupAddressDetails element not found for click listener.');
            }
        });
    } else {
        console.error('Error: pickupAddressDisplay element not found for click listener after DOMContentLoaded.');
    }

    if (dropoffAddressDisplay) {
        dropoffAddressDisplay.addEventListener('click', () => {
            if (dropoffAddressDetails) {
                dropoffAddressDetails.classList.remove('hidden');
                dropoffAddressDetails.classList.add('visible'); // Ensure it becomes visible
                dropoffAddressDisplay.classList.add('hidden'); // Hide the display field
                dropoffStreetInput.focus();
                // Initialize autocomplete when the input becomes visible
                if (window.google && window.google.maps && window.google.maps.places) {
                    initializeAutocompleteForInput(dropoffStreetInput, 'dropoff');
                } else {
                    console.warn('Google Maps Places library not yet loaded for autocomplete initialization.');
                }
            } else {
                console.error('Error: dropoffAddressDetails element not found for click listener.');
            }
        });
    } else {
        console.error('Error: dropoffAddressDisplay element not found for click listener after DOMContentLoaded.');
    }

    // Set default date to today
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    pickupDateInput.value = `${year}-${month}-${day}`;

    // Set default time to next 15-minute increment
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

    // Load Google Maps API script. Autocomplete initialization is now handled when inputs are revealed.
    loadGoogleMapsScript();
});
