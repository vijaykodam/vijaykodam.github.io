document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('fitness-form');
    const results = document.getElementById('results');
    const vo2maxResult = document.getElementById('vo2max-result');
    const bmiResult = document.getElementById('bmi-result');
    const fitnessIndexResult = document.getElementById('fitness-index-result');
    const fitnessClassResult = document.getElementById('fitness-class-result');
    const calculationDetails = document.getElementById('calculation-details');
    const newCalculationButton = document.getElementById('new-calculation');

    // Formula-based average VO2max calculation for men and women
    function calculateAverageVO2max(age, gender) {
        if (gender === 'male') {
            return -0.34 * age + 57.0;
        } else if (gender === 'female') {
            return -0.286 * age + 45.92;  // Example values derived similarly to men's
        }
    }

    form.addEventListener('submit', function(event) {
        event.preventDefault();

        const age = parseInt(document.getElementById('age').value);
        const gender = document.getElementById('gender').value;
        const weight = parseFloat(document.getElementById('weight').value);
        const height = parseFloat(document.getElementById('height').value);
        const timeMinutes = parseInt(document.getElementById('time-minutes').value);
        const timeSeconds = parseInt(document.getElementById('time-seconds').value);
        const heartRate = parseInt(document.getElementById('heart-rate').value);

        const timeInMinutes = timeMinutes + timeSeconds / 60;
        const heightInMeters = height / 100;
        const bmi = weight / (heightInMeters * heightInMeters);

        let vo2max;

        if (gender === 'male') {
            vo2max = 184.9 - (4.65 * timeInMinutes) - (0.22 * heartRate) - (0.26 * age) - (1.05 * bmi);
        } else {
            vo2max = 116.2 - (2.98 * timeInMinutes) - (0.11 * heartRate) - (0.14 * age) - (0.39 * bmi);
        }

        let fitnessIndex = Math.round(vo2max);

        // Get the average VO2max for the user's age and gender
        const averageVO2max = calculateAverageVO2max(age, gender);
        
        // Calculate fitness class based on comparison with average VO2max
        let fitnessClass;

        if (vo2max < 0.7 * averageVO2max) {
            fitnessClass = "Considerably below average";
        } else if (vo2max < 0.9 * averageVO2max) {
            fitnessClass = "Somewhat below average";
        } else if (vo2max >= 0.9 * averageVO2max && vo2max <= 1.1 * averageVO2max) {
            fitnessClass = "Average";
        } else if (vo2max > 1.1 * averageVO2max && vo2max <= 1.3 * averageVO2max) {
            fitnessClass = "Somewhat above average";
        } else {
            fitnessClass = "Considerably above average";
        }

        // Display results
        vo2maxResult.textContent = vo2max.toFixed(2);
        bmiResult.textContent = bmi.toFixed(2);
        fitnessIndexResult.textContent = fitnessIndex;
        fitnessClassResult.textContent = fitnessClass;

        // Conditionally display the guidance section only if the fitness level is below average
        if (vo2max < 0.9 * averageVO2max) {
            const targetVO2max = averageVO2max; // Use the age and gender-specific average as the target VO2max
            const calculation = calculateHeartRateForVO2max(gender, age, bmi, targetVO2max);

            calculationDetails.innerHTML = `
                <h4>To reach a VO2max of ${targetVO2max.toFixed(2)} ml·min⁻¹·kg⁻¹ (Average for your age and gender):</h4>
                <p>With your current weight and height, to reach an average fitness level:</p>
                <ul>
                    <li>If you walk for <strong>${calculation.time.toFixed(2)} minutes</strong>, your heart rate should be approximately <strong>${calculation.heartRate.toFixed(0)} bpm</strong>.</li>
                </ul>
                <p><em>Note:</em> Your fitness level is influenced by various factors, not just walk time or heart rate. This includes overall health, nutrition, sleep, stress levels, and more.</p>
                <p class="disclaimer">
                    <strong>Disclaimer:</strong> This tool is for informational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment. Always consult your doctor or a qualified health professional before making any changes to your exercise routine or lifestyle.
                </p>
            `;
            calculationDetails.style.display = 'block';
        } else {
            calculationDetails.style.display = 'none';
        }

        form.style.display = 'none';
        results.style.display = 'block';
    });

    newCalculationButton.addEventListener('click', function() {
        form.reset();
        form.style.display = 'block';
        results.style.display = 'none';
    });

    /**
     * Calculate the heart rate required to achieve a given VO2max at a specific time.
     * @param {string} gender - 'male' or 'female'
     * @param {number} age - User's age in years
     * @param {number} bmi - Calculated Body Mass Index
     * @param {number} targetVO2max - Target VO2max to achieve (e.g., 50 ml·min⁻¹·kg⁻¹)
     * @returns {Object} - An object containing the time and calculated heart rate
     */
    function calculateHeartRateForVO2max(gender, age, bmi, targetVO2max) {
        const timeInMinutes = parseFloat(document.getElementById('time-minutes').value) + parseFloat(document.getElementById('time-seconds').value) / 60;
        let heartRate;

        if (gender === 'male') {
            heartRate = (184.9 - targetVO2max - (4.65 * timeInMinutes) - (0.26 * age) - (1.05 * bmi)) / 0.22;
        } else {
            heartRate = (116.2 - targetVO2max - (2.98 * timeInMinutes) - (0.14 * age) - (0.39 * bmi)) / 0.11;
        }

        return {
            time: timeInMinutes,
            heartRate: Math.round(heartRate)
        };
    }
});

