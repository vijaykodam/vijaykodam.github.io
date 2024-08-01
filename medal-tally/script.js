document.addEventListener('DOMContentLoaded', function() {
    const finlandTableBody = document.getElementById('finland-medal-tally').getElementsByTagName('tbody')[0];
    const indiaTableBody = document.getElementById('india-medal-tally').getElementsByTagName('tbody')[0];

    const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36";
    const apiUrl = "https://olympics.com/OG2024/data/CIS_MedalNOCs~lang=ENG~comp=OG2024.json";

    fetch(apiUrl, { headers: { "User-Agent": USER_AGENT } })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Fetched data:', data); // Log the fetched data to see its structure

            const nocs = {};

            data.medalNOC.forEach(item => {
                if (item.gender === "TOT" && item.sport === "GLO") {
                    const noc = item.org;
                    if (!nocs[noc]) {
                        nocs[noc] = {
                            gold: 0,
                            silver: 0,
                            bronze: 0,
                            rank: item.rank,
                        };
                    }
                    nocs[noc].gold += item.gold;
                    nocs[noc].silver += item.silver;
                    nocs[noc].bronze += item.bronze;
                }
            });

            // Sort by rank
            const sortedNocs = Object.entries(nocs).sort((a, b) => a[1].rank - b[1].rank);

            // Find and display Finland's medals
            const finlandData = sortedNocs.find(record => record[0] === 'FIN');
            const finlandMedals = finlandData ? finlandData[1] : { gold: 0, silver: 0, bronze: 0, rank: 'N/A' };
            console.log('Finland medals:', finlandMedals); // Log Finland's medals

            const finlandRow = finlandTableBody.insertRow();
            finlandRow.insertCell(0).textContent = finlandMedals.rank;
            finlandRow.insertCell(1).textContent = 'Total';
            finlandRow.insertCell(2).textContent = finlandMedals.gold;
            finlandRow.insertCell(3).textContent = finlandMedals.silver;
            finlandRow.insertCell(4).textContent = finlandMedals.bronze;

            // Find and display India's medals
            const indiaData = sortedNocs.find(record => record[0] === 'IND');
            const indiaMedals = indiaData ? indiaData[1] : { gold: 0, silver: 0, bronze: 0, rank: 'N/A' };
            console.log('India medals:', indiaMedals); // Log India's medals

            const indiaRow = indiaTableBody.insertRow();
            indiaRow.insertCell(0).textContent = indiaMedals.rank;
            indiaRow.insertCell(1).textContent = 'Total';
            indiaRow.insertCell(2).textContent = indiaMedals.gold;
            indiaRow.insertCell(3).textContent = indiaMedals.silver;
            indiaRow.insertCell(4).textContent = indiaMedals.bronze;
        })
        .catch(error => console.error('Error fetching data:', error));
});
