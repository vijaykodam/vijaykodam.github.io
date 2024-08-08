//console.log('Flag game script loaded');  // Debug: Check if script is loaded

document.addEventListener('DOMContentLoaded', () => {
    //console.log('DOM fully loaded and parsed');  // Debug: Check if DOMContentLoaded event fires

    const flags = [
        { name: "Afghanistan", code: "af" },
        { name: "Albania", code: "al" },
        { name: "Algeria", code: "dz" },
        { name: "Andorra", code: "ad" },
        { name: "Angola", code: "ao" },
        { name: "Antigua and Barbuda", code: "ag" },
        { name: "Argentina", code: "ar" },
        { name: "Armenia", code: "am" },
        { name: "Australia", code: "au" },
        { name: "Austria", code: "at" },
        { name: "Azerbaijan", code: "az" },
        { name: "Bahamas", code: "bs" },
        { name: "Bahrain", code: "bh" },
        { name: "Bangladesh", code: "bd" },
        { name: "Barbados", code: "bb" },
        { name: "Belarus", code: "by" },
        { name: "Belgium", code: "be" },
        { name: "Belize", code: "bz" },
        { name: "Benin", code: "bj" },
        { name: "Bhutan", code: "bt" },
        { name: "Bolivia", code: "bo" },
        { name: "Bosnia and Herzegovina", code: "ba" },
        { name: "Botswana", code: "bw" },
        { name: "Brazil", code: "br" },
        { name: "Brunei", code: "bn" },
        { name: "Bulgaria", code: "bg" },
        { name: "Burkina Faso", code: "bf" },
        { name: "Burundi", code: "bi" },
        { name: "Cabo Verde", code: "cv" },
        { name: "Cambodia", code: "kh" },
        { name: "Cameroon", code: "cm" },
        { name: "Canada", code: "ca" },
        { name: "Central African Republic", code: "cf" },
        { name: "Chad", code: "td" },
        { name: "Chile", code: "cl" },
        { name: "China", code: "cn" },
        { name: "Colombia", code: "co" },
        { name: "Comoros", code: "km" },
        { name: "Congo, Republic of the", code: "cg" },
        { name: "Congo, Democratic Republic of the", code: "cd" },
        { name: "Costa Rica", code: "cr" },
        { name: "Croatia", code: "hr" },
        { name: "Cuba", code: "cu" },
        { name: "Cyprus", code: "cy" },
        { name: "Czech Republic", code: "cz" },
        { name: "Denmark", code: "dk" },
        { name: "Djibouti", code: "dj" },
        { name: "Dominica", code: "dm" },
        { name: "Dominican Republic", code: "do" },
        { name: "Ecuador", code: "ec" },
        { name: "Egypt", code: "eg" },
        { name: "El Salvador", code: "sv" },
        { name: "Equatorial Guinea", code: "gq" },
        { name: "Eritrea", code: "er" },
        { name: "Estonia", code: "ee" },
        { name: "Eswatini", code: "sz" },
        { name: "Ethiopia", code: "et" },
        { name: "Fiji", code: "fj" },
        { name: "Finland", code: "fi" },
        { name: "France", code: "fr" },
        { name: "Gabon", code: "ga" },
        { name: "Gambia", code: "gm" },
        { name: "Georgia", code: "ge" },
        { name: "Germany", code: "de" },
        { name: "Ghana", code: "gh" },
        { name: "Greece", code: "gr" },
        { name: "Grenada", code: "gd" },
        { name: "Guatemala", code: "gt" },
        { name: "Guinea", code: "gn" },
        { name: "Guinea-Bissau", code: "gw" },
        { name: "Guyana", code: "gy" },
        { name: "Haiti", code: "ht" },
        { name: "Honduras", code: "hn" },
        { name: "Hungary", code: "hu" },
        { name: "Iceland", code: "is" },
        { name: "India", code: "in" },
        { name: "Indonesia", code: "id" },
        { name: "Iran", code: "ir" },
        { name: "Iraq", code: "iq" },
        { name: "Ireland", code: "ie" },
        { name: "Israel", code: "il" },
        { name: "Italy", code: "it" },
        { name: "Jamaica", code: "jm" },
        { name: "Japan", code: "jp" },
        { name: "Jordan", code: "jo" },
        { name: "Kazakhstan", code: "kz" },
        { name: "Kenya", code: "ke" },
        { name: "Kiribati", code: "ki" },
        { name: "Korea, North", code: "kp" },
        { name: "Korea, South", code: "kr" },
        { name: "Kuwait", code: "kw" },
        { name: "Kyrgyzstan", code: "kg" },
        { name: "Laos", code: "la" },
        { name: "Latvia", code: "lv" },
        { name: "Lebanon", code: "lb" },
        { name: "Lesotho", code: "ls" },
        { name: "Liberia", code: "lr" },
        { name: "Libya", code: "ly" },
        { name: "Liechtenstein", code: "li" },
        { name: "Lithuania", code: "lt" },
        { name: "Luxembourg", code: "lu" },
        { name: "Madagascar", code: "mg" },
        { name: "Malawi", code: "mw" },
        { name: "Malaysia", code: "my" },
        { name: "Maldives", code: "mv" },
        { name: "Mali", code: "ml" },
        { name: "Malta", code: "mt" },
        { name: "Marshall Islands", code: "mh" },
        { name: "Mauritania", code: "mr" },
        { name: "Mauritius", code: "mu" },
        { name: "Mexico", code: "mx" },
        { name: "Micronesia", code: "fm" },
        { name: "Moldova", code: "md" },
        { name: "Monaco", code: "mc" },
        { name: "Mongolia", code: "mn" },
        { name: "Montenegro", code: "me" },
        { name: "Morocco", code: "ma" },
        { name: "Mozambique", code: "mz" },
        { name: "Myanmar", code: "mm" },
        { name: "Namibia", code: "na" },
        { name: "Nauru", code: "nr" },
        { name: "Nepal", code: "np" },
        { name: "Netherlands", code: "nl" },
        { name: "New Zealand", code: "nz" },
        { name: "Nicaragua", code: "ni" },
        { name: "Niger", code: "ne" },
        { name: "Nigeria", code: "ng" },
        { name: "North Macedonia", code: "mk" },
        { name: "Norway", code: "no" },
        { name: "Oman", code: "om" },
        { name: "Pakistan", code: "pk" },
        { name: "Palau", code: "pw" },
        { name: "Palestine", code: "ps" },
        { name: "Panama", code: "pa" },
        { name: "Papua New Guinea", code: "pg" },
        { name: "Paraguay", code: "py" },
        { name: "Peru", code: "pe" },
        { name: "Philippines", code: "ph" },
        { name: "Poland", code: "pl" },
        { name: "Portugal", code: "pt" },
        { name: "Qatar", code: "qa" },
        { name: "Romania", code: "ro" },
        { name: "Russia", code: "ru" },
        { name: "Rwanda", code: "rw" },
        { name: "Saint Kitts and Nevis", code: "kn" },
        { name: "Saint Lucia", code: "lc" },
        { name: "Saint Vincent and the Grenadines", code: "vc" },
        { name: "Samoa", code: "ws" },
        { name: "San Marino", code: "sm" },
        { name: "Sao Tome and Principe", code: "st" },
        { name: "Saudi Arabia", code: "sa" },
        { name: "Senegal", code: "sn" },
        { name: "Serbia", code: "rs" },
        { name: "Seychelles", code: "sc" },
        { name: "Sierra Leone", code: "sl" },
        { name: "Singapore", code: "sg" },
        { name: "Slovakia", code: "sk" },
        { name: "Slovenia", code: "si" },
        { name: "Solomon Islands", code: "sb" },
        { name: "Somalia", code: "so" },
        { name: "South Africa", code: "za" },
        { name: "South Sudan", code: "ss" },
        { name: "Spain", code: "es" },
        { name: "Sri Lanka", code: "lk" },
        { name: "Sudan", code: "sd" },
        { name: "Suriname", code: "sr" },
        { name: "Sweden", code: "se" },
        { name: "Switzerland", code: "ch" },
        { name: "Syria", code: "sy" },
        { name: "Taiwan", code: "tw" },
        { name: "Tajikistan", code: "tj" },
        { name: "Tanzania", code: "tz" },
        { name: "Thailand", code: "th" },
        { name: "Timor-Leste", code: "tl" },
        { name: "Togo", code: "tg" },
        { name: "Tonga", code: "to" },
        { name: "Trinidad and Tobago", code: "tt" },
        { name: "Tunisia", code: "tn" },
        { name: "Turkey", code: "tr" },
        { name: "Turkmenistan", code: "tm" },
        { name: "Tuvalu", code: "tv" },
        { name: "Uganda", code: "ug" },
        { name: "Ukraine", code: "ua" },
        { name: "United Arab Emirates", code: "ae" },
        { name: "United Kingdom", code: "gb" },
        { name: "United States", code: "us" },
        { name: "Uruguay", code: "uy" },
        { name: "Uzbekistan", code: "uz" },
        { name: "Vanuatu", code: "vu" },
        { name: "Venezuela", code: "ve" },
        { name: "Vietnam", code: "vn" },
        { name: "Yemen", code: "ye" },
        { name: "Zambia", code: "zm" },
        { name: "Zimbabwe", code: "zw" }
    ];

    const gameContainer = document.getElementById('quiz-mini-image');
    if (!gameContainer) {
        console.error('Game container not found');
        return;
    }
    //console.log('Game container found');  // Debug: Check if game container is found

    const optionsContainer = document.getElementById('quiz-mini-options');
    const resultContainer = document.getElementById('quiz-mini-result');
    const correctSpan = document.getElementById('quiz-mini-correct');
    const wrongSpan = document.getElementById('quiz-mini-wrong');
    const counterSpan = document.getElementById('quiz-mini-counter');
    const correctResult = document.getElementById('quiz-mini-result-correct');
    const wrongResult = document.getElementById('quiz-mini-result-wrong');
    const wrongName = document.getElementById('quiz-mini-result-wrong-name');
    const refreshButton = document.getElementById('quiz-mini-refresh');
    let score = 0;
    let wrong = 0;
    let currentQuestionIndex = 0;
    let gameFinished = false;
    let selectedFlags = [];

    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function pickRandomFlags() {
        const selected = [];
        const usedIndices = new Set();

        while (selected.length < 10) {
            const randomIndex = Math.floor(Math.random() * flags.length);
            if (!usedIndices.has(randomIndex)) {
                selected.push(flags[randomIndex]);
                usedIndices.add(randomIndex);
            }
        }

        //console.log(selected);  // Debug: Check the selected flags
        return selected;
    }

    function generateOptions(correctOption) {
        let options = [correctOption];
        while (options.length < 4) {
            const randomOption = flags[Math.floor(Math.random() * flags.length)].name;
            if (!options.includes(randomOption)) {
                options.push(randomOption);
            }
        }
        shuffle(options);
        return options;
    }

    function showQuestion() {
        if (currentQuestionIndex >= 10) {
            displayFinalScore();
            return;
        }

        const flag = selectedFlags[currentQuestionIndex];
        const img = document.createElement('img');
        img.src = `/flags/${flag.code}.png`;
        img.alt = flag.name;
        img.style.height = '120px';
        gameContainer.innerHTML = '';
        gameContainer.appendChild(img);

        const options = generateOptions(flag.name);
        optionsContainer.innerHTML = '';
        options.forEach(option => {
            const button = document.createElement('button');
            button.textContent = option;
            button.classList.add('option-button');
            button.onclick = () => handleAnswer(option);
            optionsContainer.appendChild(button);
        });

        counterSpan.textContent = `${currentQuestionIndex + 1}`;
        //console.log(`Question ${currentQuestionIndex + 1} displayed`);
    }

    function handleAnswer(selectedOption) {
        if (gameFinished) return;

        const flag = selectedFlags[currentQuestionIndex];
        if (selectedOption === flag.name) {
            score++;
            correctResult.style.display = 'block';
            wrongResult.style.display = 'none';
        } else {
            wrong++;
            correctResult.style.display = 'none';
            wrongResult.style.display = 'block';
            wrongName.textContent = flag.name;
        }

        correctSpan.textContent = score;
        wrongSpan.textContent = wrong;

        currentQuestionIndex++;
        if (currentQuestionIndex < 10) {
            showQuestion();
        } else {
            gameFinished = true;
            displayFinalScore();
        }
        //console.log(`Answer handled, score: ${score}, wrong: ${wrong}`);
    }

    function displayFinalScore() {
        gameContainer.innerHTML = '';
        optionsContainer.innerHTML = '';

        const finalScoreText = `You scored ${score} out of 10!`;
        const finalResult = document.createElement('div');
        finalResult.innerHTML = `
            <p>${finalScoreText}</p>
            <p><strong>${score}</strong> correct</p>
            <p><strong>${wrong}</strong> wrong</p>
        `;
        resultContainer.innerHTML = '';
        resultContainer.appendChild(finalResult);
        resultContainer.style.display = 'block';
        refreshButton.textContent = 'Restart Game';
        refreshButton.style.display = 'inline-block';
        refreshButton.style.visibility = 'visible';
        refreshButton.style.opacity = '1';
        refreshButton.style.zIndex = '1000';
        console.log('Final score displayed, refreshButton style:', refreshButton.style.display);
    }

    refreshButton.onclick = () => {
        currentQuestionIndex = 0;
        score = 0;
        wrong = 0;
        gameFinished = false;
        correctSpan.textContent = score;
        wrongSpan.textContent = wrong;
        resultContainer.style.display = 'none';
        refreshButton.style.display = 'none';
        selectedFlags = pickRandomFlags();
        showQuestion();
        console.log('Game restarted');
    };

    selectedFlags = pickRandomFlags();
    showQuestion();
});

