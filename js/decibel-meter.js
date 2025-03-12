document.addEventListener('DOMContentLoaded', () => {
    // Level definitions
    const levels = [
        { max: 20, color: '#4CAF50', desc: 'Quiet (Whisper)', percent: 10 },
        { max: 40, color: '#4CAF50', desc: 'Quiet (Library)', percent: 20 },
        { max: 60, color: '#4CAF50', desc: 'Conversation', percent: 40 },
        { max: 80, color: '#4CAF50', desc: 'Loud (City Traffic)', percent: 60 },
        { max: 90, color: '#FFC107', desc: 'Very Loud (Lawnmower)', percent: 70 },
        { max: 100, color: '#FF5722', desc: 'Extremely Loud (Motorcycle)', percent: 80 },
        { max: 120, color: '#FF5722', desc: 'Painful (Rock Concert)', percent: 90 },
        { max: 140, color: '#D32F2F', desc: 'Dangerous (Jet Engine)', percent: 100 }
    ];

    // DOM elements
    const meterContainer = document.getElementById('meterContainer');
    const meterFill = document.getElementById('meterFill');
    const reading = document.getElementById('reading');
    const description = document.getElementById('description');
    const startButton = document.getElementById('startButton');
    const errorMessage = document.getElementById('errorMessage');
    
    let audioContext;
    let analyser;
    let microphone;
    let javascriptNode;
    let isActive = false;
    
    // Create meter markers
    function createMarkers() {
        const markers = [0, 20, 40, 60, 80, 90, 100, 120, 140];
        
        markers.forEach(level => {
            const percent = level >= 140 ? 100 : (level / 140) * 100;
            const position = 100 - percent;
            
            // Create marker line
            const marker = document.createElement('div');
            marker.className = 'meter-marker';
            marker.style.bottom = `${percent}%`;
            meterContainer.appendChild(marker);
            
            // Create label
            const label = document.createElement('div');
            label.className = 'meter-label';
            label.textContent = `${level} dB`;
            label.style.bottom = `${percent}%`;
            meterContainer.appendChild(label);
        });
        
        // Add meter dot
        const dot = document.createElement('div');
        dot.className = 'meter-dot';
        dot.id = 'meterDot';
        meterContainer.appendChild(dot);
    }
    
    // Update the meter display
    function updateMeter(dbValue) {
        // Limit to 0-140 dB range
        dbValue = Math.max(0, Math.min(140, dbValue));
        
        // Find the level
        let levelInfo = levels[0];
        for (let i = 0; i < levels.length; i++) {
            if (dbValue <= levels[i].max) {
                levelInfo = levels[i];
                break;
            }
        }
        
        // Calculate fill height percentage (0-140 dB scale)
        const heightPercent = (dbValue / 140) * 100;
        
        // Update DOM elements
        meterFill.style.height = `${heightPercent}%`;
        meterFill.style.background = levelInfo.color;
        
        reading.textContent = `${Math.round(dbValue)} dB`;
        reading.style.color = levelInfo.color;
        
        description.textContent = levelInfo.desc;
        description.style.color = levelInfo.color;
        
        // Update dot position
        const dot = document.getElementById('meterDot');
        dot.style.bottom = `${heightPercent}%`;
        dot.style.borderColor = levelInfo.color;
    }
    
    // Start audio processing
    function startAudioProcessing() {
        try {
            // Set up the audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            
            // Set up analyser node
            analyser.smoothingTimeConstant = 0.8;
            analyser.fftSize = 2048;
            
            // Get microphone input
            navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                .then(stream => {
                    microphone = audioContext.createMediaStreamSource(stream);
                    microphone.connect(analyser);
                    
                    // Create a JavaScript node for processing
                    javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
                    analyser.connect(javascriptNode);
                    javascriptNode.connect(audioContext.destination);
                    
                    // Process audio data
                    javascriptNode.onaudioprocess = function() {
                        const array = new Uint8Array(analyser.frequencyBinCount);
                        analyser.getByteFrequencyData(array);
                        
                        // Get average volume
                        let values = 0;
                        for (let i = 0; i < array.length; i++) {
                            values += array[i];
                        }
                        const average = values / array.length;
                        
                        // Convert to decibels (approximate)
                        // This is a rough approximation as true dB measurement requires calibration
                        const dbValue = Math.round(average * 140 / 255);
                        
                        // Update meter
                        updateMeter(dbValue);
                    };
                    
                    isActive = true;
                    startButton.textContent = 'Stop Measuring';
                    description.textContent = 'Listening...';
                    errorMessage.textContent = '';
                })
                .catch(err => {
                    const errorMsg = err.message;
                    errorMessage.innerHTML = `<strong>Error accessing microphone:</strong> ${errorMsg}<br>
                    <span style="font-size: 14px; display: block; margin-top: 5px;">
                      This app requires HTTPS or localhost to access your microphone.
                    </span>`;
                    console.error(err);
                });
        } catch (err) {
            errorMessage.textContent = 'Error initializing audio: ' + err.message;
            console.error('Error initializing audio:', err);
        }
    }
    
    // Stop audio processing
    function stopAudioProcessing() {
        if (javascriptNode) {
            javascriptNode.disconnect();
            javascriptNode = null;
        }
        
        if (microphone) {
            microphone.disconnect();
            microphone = null;
        }
        
        if (analyser) {
            analyser.disconnect();
            analyser = null;
        }
        
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        
        isActive = false;
        startButton.textContent = 'Start Measuring';
        description.textContent = 'Microphone is off';
    }
    
    // Toggle audio processing
    startButton.addEventListener('click', function() {
        if (isActive) {
            stopAudioProcessing();
        } else {
            startAudioProcessing();
        }
    });
    
    // Initialize app
    createMarkers();
    updateMeter(0);
});