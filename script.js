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
const confirmationMessage = document.getElementById('confirmationMessage'); // This is now a <p> tag

// These elements are now removed from HTML, but kept in JS for robustness if IDs somehow persist
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
            // Autocomplete initialization is now handled when inputs are revealed.
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

    console.log(`Initializing Google Place Autocomplete for ${inputElement.id}...`);

    const autocomplete = new google.maps.places.Autocomplete(inputElement, {
        // types: ['address'],
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
    console.log(`Google Place Autocomplete initialized for ${inputElement.id}.`);
}


// Function to perform the distance calculation and display price
async function calculatePriceAndPrepareConfirmation() {
    const origin = `${pickupStreetInput.value.trim()} ${pickupAptInput.value.trim()} ${pickupCityInput.value.trim()}, ${pickupStateInput.value.trim()} ${pickupZipInput.value.trim()}`.trim();
    const destination = `${dropoffStreetInput.value.trim()} ${dropoffAptInput.value.trim()} ${dropoffCityInput.value.trim()}, ${dropoffStateInput.value.trim()} ${dropoffZipInput.value.trim()}`.trim();

    // Clear previous messages/displays
    resultDiv.classList.add('hidden');
    confirmationMessage.classList.add('hidden'); // Hide confirmation message
    totalPriceDisplay.textContent = '';
    priceLabel.classList.add('hidden');
    requestRideButton.classList.remove('hidden'); // Ensure button is visible

    // --- VALIDATION FOR PRICE CALCULATION (FIRST CLICK) ---
    // Only require Street, City, State for price calculation. Zip is optional here.
    if (!pickupStreetInput.value.trim() || !pickupCityInput.value.trim() || !pickupStateInput.value.trim() ||
        !dropoffStreetInput.value.trim() || !dropoffCityInput.value.trim() || !dropoffStateInput.value.trim()) {
        alert('PLEASE FILL IN STREET, CITY, AND STATE FOR BOTH PICKUP AND DROP-OFF ADDRESSES TO GET AN ESTIMATED PRICE.');
        requestRideButton.textContent = 'Reserve your Ride'; // Reset button text
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

                    requestRideButton.textContent = 'Confirm Ride';
                    isPriceCalculated = 1; // Price is now calculated

                    estimatedPriceInput.value = price.toFixed(2); // Set hidden input for Formspree

                    console.log('Ride Request Details:');
                    console.log('Pickup:', origin);
                    console.log('Drop-off:', destination);
                    console.log('Estimated Price:', `$${price.toFixed(2)}`);

                } else {
                    alert('COULD NOT CALCULATE DISTANCE. PLEASE CHECK ADDRESSES OR TRY AGAIN LATER. STATUS: ' + status);
                    console.error('Distance Matrix Error:', response);
                    isPriceCalculated = 0; // Reset state on error
                    priceLabel.classList.add('hidden');
                    totalPriceDisplay.classList.add('hidden');
                    resultDiv.classList.add('hidden');
                    requestRideButton.textContent = 'Reserve your Ride'; // Reset button text
                }
                requestRideButton.disabled = false; // Re-enable button
            }
        );
    } catch (error) {
        console.error('Error during ride request:', error);
        alert('AN ERROR OCCURRED WHILE PROCESSING YOUR REQUEST. PLEASE TRY AGAIN.');
        isPriceCalculated = 0; // Reset state on error
        priceLabel.classList.add('hidden');
        totalPriceDisplay.classList.add('hidden');
        resultDiv.classList.add('hidden');
        requestRideButton.textContent = 'Reserve your Ride'; // Reset button text
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
requestRideButton.addEventListener('click', async () => { // Added async here
    if (isPriceCalculated === 0) {
        // First click: Calculate price
        calculatePriceAndPrepareConfirmation();
    } else if (isPriceCalculated === 1) {
        // --- UPDATED VALIDATION FOR FORM SUBMISSION (SECOND CLICK) ---
        const customerName = customerNameInput.value.trim();
        const pickupDate = pickupDateInput.value;
        const pickupTime = pickupTimeInput.value;
        const phoneNumber = phoneNumberInput.value.trim();

        // Debugging: Log values before validation
        console.log('--- Submission Validation Check ---');
        console.log('Customer Name:', `"${customerName}"`, 'Empty:', !customerName);
        console.log('Pickup Date:', `"${pickupDate}"`, 'Empty:', !pickupDate);
        console.log('Pickup Time:', `"${pickupTime}"`, 'Empty:', !pickupTime);
        console.log('Phone Number:', `"${phoneNumber}"`, 'Empty:', !phoneNumber);
        console.log('Pickup Street:', `"${pickupStreetInput.value.trim()}"`, 'Empty:', !pickupStreetInput.value.trim());
        console.log('Pickup City:', `"${pickupCityInput.value.trim()}"`, 'Empty:', !pickupCityInput.value.trim());
        console.log('Pickup State:', `"${pickupStateInput.value.trim()}"`, 'Empty:', !pickupStateInput.value.trim());
        console.log('Dropoff Street:', `"${dropoffStreetInput.value.trim()}"`, 'Empty:', !dropoffStreetInput.value.trim());
        console.log('Dropoff City:', `"${dropoffCityInput.value.trim()}"`, 'Empty:', !dropoffCityInput.value.trim());
        console.log('Dropoff State:', `"${dropoffStateInput.value.trim()}"`, 'Empty:', !dropoffStateInput.value.trim());
        console.log('---------------------------------');


        // Validate all required fields for submission (Zip Codes are optional)
        if (!customerName || !pickupDate || !pickupTime || !phoneNumber ||
            !pickupStreetInput.value.trim() || !pickupCityInput.value.trim() || !pickupStateInput.value.trim() ||
            !dropoffStreetInput.value.trim() || !dropoffCityInput.value.trim() || !dropoffStateInput.value.trim()) {
            alert('PLEASE FILL IN ALL REQUIRED FIELDS TO CONFIRM YOUR RIDE.'); // Simplified alert message
            return; // Stop submission if validation fails
        }

        // Second click: Submit form data asynchronously and show final confirmation message
        requestRideButton.textContent = 'Submitting...';
        requestRideButton.disabled = true;

        const form = bookingForm;
        const formData = new FormData(form);
        const formUrl = form.action;

        try {
            const response = await fetch(formUrl, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json' // Important for Formspree AJAX
                }
            });

            if (response.ok) {
                // Form submitted successfully
                resultDiv.classList.add('hidden');
                confirmationMessage.textContent = 'THANK YOU. A CONFIRMATION TEXT WILL BE SENT SHORTLY WITH PAYMENT OPTIONS.';
                confirmationMessage.classList.remove('hidden');
                requestRideButton.classList.add('hidden'); // Hide the button after submission
                isPriceCalculated = 2; // Set to final submitted state
            } else {
                // Formspree returned an error (e.g., validation failed)
                const errorData = await response.json();
                console.error('Formspree submission error:', errorData);
                alert('THERE WAS AN ERROR SUBMITTING YOUR REQUEST. PLEASE TRY AGAIN. IF THE PROBLEM PERSISTS, CONTACT US DIRECTLY.');
                requestRideButton.textContent = 'Confirm Ride'; // Allow retry
                requestRideButton.disabled = false;
                isPriceCalculated = 1; // Stay in calculated state
            }
        } catch (error) {
            // Network error or other fetch issue
            console.error('Network or submission error:', error);
            alert('COULD NOT CONNECT TO THE SERVER TO SUBMIT YOUR REQUEST. PLEASE CHECK YOUR INTERNET CONNECTION AND TRY AGAIN.');
            requestRideButton.textContent = 'Confirm Ride'; // Allow retry
            requestRideButton.disabled = false;
            isPriceCalculated = 1; // Stay in calculated state
        }
    }
});

// Reset state if any input field changes after price calculation
const inputFields = [
    customerNameInput,
    pickupDateInput,
    pickupTimeInput,
    pickupStreetInput,
    pickupAptInput,
    pickupCityInput,
    pickupStateInput,
    pickupZipInput, // Keep in this list so changing it resets the form
    dropoffStreetInput,
    dropoffAptInput,
    dropoffCityInput,
    dropoffStateInput,
    dropoffZipInput, // Keep in this list so changing it resets the form
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
            requestRideButton.textContent = 'Reserve your Ride'; // Reset button text
            confirmationMessage.classList.add('hidden'); // Hide confirmation message
        }
    });
});

// --- Initial Setup on DOM Load ---
window.addEventListener('DOMContentLoaded', () => {
    // These are the containers for the detailed address inputs, not the display fields
    const pickupAddressDetails = document.getElementById('pickupAddressDetails');
    const dropoffAddressDetails = document.getElementById('dropoffAddressDetails');

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
// --- Temporary Styling Fix for Textarea ---
// This ensures the textarea matches the input field styling if not applied by CSS
document.addEventListener('DOMContentLoaded', () => {
    const specialNotesTextarea = document.getElementById('specialNotes');
    if (specialNotesTextarea) {
        specialNotesTextarea.style.backgroundColor = '#5a3d8b'; // Light purple
        specialNotesTextarea.style.color = '#ffffff'; // White text
        specialNotesTextarea.style.fontSize = '1em'; // Match font size
        specialNotesTextarea.style.padding = '12px'; // Match padding
        specialNotesTextarea.style.marginBottom = '5px'; // Reduced margin to bring button closer
        specialNotesTextarea.style.border = 'none'; // Remove border
        specialNotesTextarea.style.borderRadius = '8px'; // Match border-radius
        specialNotesTextarea.style.boxSizing = 'border-box'; // Match box-sizing
    }
});
