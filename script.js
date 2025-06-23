function initMap() {}

document.getElementById("rideForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const pickup = document.getElementById("pickup").value;
    const dropoff = document.getElementById("dropoff").value;

    const apiKey = GOOGLE_MAPS_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(pickup)}&destinations=${encodeURIComponent(dropoff)}&key=${apiKey}`;

    const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
    const response = await fetch(proxyUrl);
    const data = await response.json();

    const distanceText = data.contents.match(/"distance"[^}]*?"text":"(.*?)"/);
    if (distanceText) {
        const miles = parseFloat(distanceText[1]);
        const rate = 1.70;
        const total = (miles * rate).toFixed(2);

        document.getElementById("priceDisplay").textContent = `$${total}`;
        document.getElementById("payButton").href = STRIPE_CHECKOUT_URL;
        document.getElementById("result").classList.remove("hidden");
    } else {
        alert("Unable to calculate distance. Check addresses.");
    }
});
