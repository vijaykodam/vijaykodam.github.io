document.addEventListener('DOMContentLoaded', function() {
    // console.log('Decibel meter initializing...');
    
    // Level definitions with more granular conversation levels for kids
    const levels = [
        { max: 20, color: '#4CAF50', desc: 'Very Quiet (Whisper)', percent: 10 },
        { max: 30, color: '#4CAF50', desc: 'Quiet (Library)', percent: 20 },
        { max: 40, color: '#7CB342', desc: 'Indoor Voice (Soft)', percent: 30 },
        { max: 50, color: '#7CB342', desc: 'Indoor Voice (Normal)', percent: 40 },
        { max: 60, color: '#FFC107', desc: 'Speaking Up (Home)', percent: 50 },
        { max: 65, color: '#FFC107', desc: 'Conversation (Classroom)', percent: 60 },
        { max: 70, color: '#FF9800', desc: 'Loud Voice (Playground)', percent: 70 },
        { max: 75, color: '#FF9800', desc: 'Very Loud (Shouting)', percent: 80 },
        { max: 85, color: '#FF5722', desc: 'Too Loud! (City Traffic)', percent: 85 },
        { max: 95, color: '#FF5722', desc: 'Extremely Loud (Lawnmower)', percent: 90 },
        { max: 110, color: '#D32F2F', desc: 'Painful (Concert)', percent: 95 },
        { max: 140, color: '#D32F2F', desc: 'Dangerous (Jet Engine)', percent: 100 }
    ];

    // DOM elements
    const needle = document.getElementById('needle');
    const reading = document.getElementById('reading');
    const description = document.getElementById('description');
    const startButton = document.getElementById('startButton');
    const errorMessage = document.getElementById('errorMessage');
    
    // Sensitivity control
    let sensitivityMultiplier = 2.0; // Default sensitivity boost
    
    // Audio context variables
    let audioContext;
    let analyser;
    let microphone;
    let javascriptNode;
    let isActive = false;
    
    // Create the speedometer
    drawSpeedometer();
    
    // Initialize display
    updateMeter(0);
    
    // Add button event listener
    if (startButton) {
        startButton.addEventListener('click', function() {
            if (isActive) {
                stopAudioProcessing();
            } else {
                startAudioProcessing();
            }
        });
    }
    
    // Add sensitivity slider event listener
    const sensitivitySlider = document.getElementById('sensitivity');
    const sensitivityValueDisplay = document.getElementById('sensitivityValue');
    if (sensitivitySlider) {
        sensitivitySlider.addEventListener('input', function() {
            sensitivityMultiplier = parseFloat(this.value);
            sensitivityValueDisplay.textContent = sensitivityMultiplier.toFixed(1) + 'x';
        });
    }
    
    // Draw the speedometer using HTML and SVG
    function drawSpeedometer() {
        const container = document.querySelector('.speedometer-container');
        
        if (!container) {
            console.error('Speedometer container not found!');
            return;
        }
        
        // console.log('Drawing speedometer...');
        
        // Create ticks
        const totalTicks = 12;
        const angleRange = 240; // degrees
        const startAngle = 150; // Starting angle for 0 dB (left side)
        
        for (let i = 0; i <= totalTicks; i++) {
            const isMajor = i % 3 === 0;
            
            // Calculate angle
            const angle = startAngle + (i / totalTicks) * angleRange;
            const radians = angle * Math.PI / 180;
            
            // Calculate position (centered at needle pivot)
            const tickLength = isMajor ? 15 : 10;
            const innerRadius = 80;
            const outerRadius = innerRadius + tickLength;
            
            // Calculate positions relative to center
            const centerX = 150;
            const centerY = 90;
            
            const x1 = centerX + innerRadius * Math.cos(radians);
            const y1 = centerY + innerRadius * Math.sin(radians);
            const x2 = centerX + outerRadius * Math.cos(radians);
            const y2 = centerY + outerRadius * Math.sin(radians);
            
            // Create tick element
            const tick = document.createElement('div');
            tick.className = isMajor ? 'major-tick' : 'tick';
            tick.style.position = 'absolute';
            tick.style.width = tickLength + 'px';
            tick.style.height = '2px';
            tick.style.backgroundColor = '#555';
            tick.style.transformOrigin = '0 50%';
            tick.style.left = x1 + 'px';
            tick.style.top = (y1 - 1) + 'px'; // -1 to center the 2px height
            
            // Calculate rotation
            const rotation = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
            tick.style.transform = 'rotate(' + rotation + 'deg)';
            
            container.appendChild(tick);
            
            // Add labels for major ticks
            if (isMajor) {
                const dbValue = Math.round((i / totalTicks) * 140);
                const labelRadius = innerRadius - 15;
                
                const labelX = centerX + labelRadius * Math.cos(radians);
                const labelY = centerY + labelRadius * Math.sin(radians);
                
                const label = document.createElement('div');
                label.className = 'tick-label';
                label.textContent = dbValue;
                label.style.position = 'absolute';
                label.style.fontSize = '10px';
                label.style.color = '#666';
                label.style.left = (labelX - 10) + 'px';
                label.style.top = (labelY - 5) + 'px';
                label.style.width = '20px';
                label.style.textAlign = 'center';
                
                container.appendChild(label);
            }
        }
        
        // Add colored arcs
        const arcGroups = [
            { maxDb: 60, color: '#4CAF50' },  // Green (quiet to normal)
            { maxDb: 75, color: '#FFC107' },  // Yellow (louder conversation)
            { maxDb: 95, color: '#FF5722' },  // Orange (very loud)
            { maxDb: 140, color: '#D32F2F' }  // Red (dangerous)
        ];
        
        let startDb = 0;
        arcGroups.forEach(group => {
            const startAngleDeg = startAngle + (startDb / 140) * angleRange;
            const endAngleDeg = startAngle + (group.maxDb / 140) * angleRange;
            
            // Create colored arc segment using SVG
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("width", "300");
            svg.setAttribute("height", "180");
            svg.style.position = "absolute";
            svg.style.top = "0";
            svg.style.left = "0";
            svg.style.zIndex = "1";
            
            const arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
            
            // Calculate arc path
            const radius = 75;
            const centerX = 150;
            const centerY = 90;
            
            // Convert to radians
            const startRad = startAngleDeg * (Math.PI / 180);
            const endRad = endAngleDeg * (Math.PI / 180);
            
            // Calculate start and end points
            const startX = centerX + radius * Math.cos(startRad);
            const startY = centerY + radius * Math.sin(startRad);
            const endX = centerX + radius * Math.cos(endRad);
            const endY = centerY + radius * Math.sin(endRad);
            
            // Arc flags
            const largeArcFlag = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
            const sweepFlag = 1;
            
            // Create arc path
            const arcPath = [
                'M', centerX, centerY,
                'L', startX, startY,
                'A', radius, radius, 0, largeArcFlag, sweepFlag, endX, endY,
                'Z'
            ].join(' ');
            
            arc.setAttribute("d", arcPath);
            arc.setAttribute("fill", group.color);
            arc.setAttribute("opacity", "0.3");
            
            svg.appendChild(arc);
            container.appendChild(svg);
            
            startDb = group.maxDb;
        });
        
        // console.log('Speedometer drawn successfully');
    }
    
    // Update the meter display
    // Buffer for calculating running average (smooth out fluctuations)
    const dbBuffer = new Array(5).fill(0);
    let dbBufferIndex = 0;
    
    // Calculate running average of sound levels for smoother readings
    function calculateRunningAverage(newValue) {
        dbBuffer[dbBufferIndex] = newValue;
        dbBufferIndex = (dbBufferIndex + 1) % dbBuffer.length;
        
        // Calculate average
        let sum = 0;
        for (let i = 0; i < dbBuffer.length; i++) {
            sum += dbBuffer[i];
        }
        return sum / dbBuffer.length;
    }
    
    function updateMeter(dbValue) {
        // Apply running average for smoother readings
        dbValue = calculateRunningAverage(dbValue);
        
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
        
        // Calculate needle rotation (240 degree range starting from 150 degrees)
        const angleRange = 240;
        const startAngle = 150;
        const percent = dbValue / 140;
        const needleAngle = startAngle + (percent * angleRange);
        
        // Update DOM elements
        if (needle) {
            needle.style.transform = 'rotate(' + needleAngle + 'deg)';
            needle.style.borderRight = '5px solid ' + levelInfo.color;
        }
        
        if (reading) {
            reading.textContent = Math.round(dbValue) + ' dB';
            reading.style.color = levelInfo.color;
        }
        
        if (description) {
            description.textContent = levelInfo.desc;
            description.style.color = levelInfo.color;
        }
    }
    
    // Start audio processing
    function startAudioProcessing() {
        try {
            // Set up the audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            
            // Set up analyser node with optimized settings
            analyser.smoothingTimeConstant = 0.6; // Slightly quicker response time
            analyser.fftSize = 4096; // Higher frequency resolution
            
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
                        // Using Float32Array for better precision
                        const bufferLength = analyser.frequencyBinCount;
                        const dataArray = new Float32Array(bufferLength);
                        analyser.getFloatFrequencyData(dataArray);
                        
                        // Focus on speech frequency range (approximately 300-3000Hz)
                        // This is a rough approximation as the exact bins depend on FFT size
                        const firstBin = Math.floor(bufferLength * 0.05); // ~300Hz
                        const lastBin = Math.floor(bufferLength * 0.3);  // ~3000Hz
                        const speechRange = dataArray.slice(firstBin, lastBin);
                        
                        let sumSquares = 0;
                        let validSamples = 0;
                        
                        for (let i = 0; i < speechRange.length; i++) {
                            // dataArray values are in dB, convert to linear scale
                            const value = speechRange[i];
                            if (value && value > -100) { // Ignore values below noise floor
                                const magnitude = Math.pow(10, value / 20);
                                sumSquares += magnitude * magnitude;
                                validSamples++;
                            }
                        }
                        
                        // Avoid division by zero
                        if (validSamples === 0) validSamples = 1;
                        
                        // RMS calculation
                        const rms = Math.sqrt(sumSquares / validSamples);
                        
                        // Proper dB conversion with sensitivity multiplier
                        // Add offset to shift from negative scale to 0-140 range
                        let dbValue = 20 * Math.log10(rms * sensitivityMultiplier + 0.0001) + 100;
                        
                        // Ensure reasonable range based on typical human voice
                        dbValue = Math.max(0, Math.min(140, dbValue));
                        
                        // Update meter
                        updateMeter(dbValue);
                    };
                    
                    isActive = true;
                    if (startButton) startButton.textContent = 'Stop Measuring';
                    if (description) description.textContent = 'Listening...';
                    if (errorMessage) errorMessage.textContent = '';
                })
                .catch(err => {
                    const errorMsg = err.message;
                    if (errorMessage) {
                        errorMessage.innerHTML = `<strong>Error accessing microphone:</strong> ${errorMsg}<br>
                        <span style="font-size: 14px; display: block; margin-top: 5px;">
                          This app requires HTTPS or localhost to access your microphone.
                        </span>`;
                    }
                    console.error(err);
                });
        } catch (err) {
            if (errorMessage) errorMessage.textContent = 'Error initializing audio: ' + err.message;
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
        if (startButton) startButton.textContent = 'Start Measuring';
        if (description) description.textContent = 'Microphone is off';
    }
});