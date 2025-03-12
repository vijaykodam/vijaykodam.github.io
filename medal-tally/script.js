document.addEventListener('DOMContentLoaded', function() {
    const finlandTableBody = document.getElementById('finland-medal-tally').getElementsByTagName('tbody')[0];
    const indiaTableBody = document.getElementById('india-medal-tally').getElementsByTagName('tbody')[0];

    // Static medal data for Paris 2024 Olympics (final result)
    const medalData = {
        // Finland data
        FIN: {
            rank: 92,
            gold: 0,
            silver: 0, 
            bronze: 0
        },
        // India data
        IND: {
            rank: 71,
            gold: 0,
            silver: 1,
            bronze: 5
        }
    };

    // Display Finland's medals
    const finlandMedals = medalData.FIN;
    const finlandRow = finlandTableBody.insertRow();
    finlandRow.insertCell(0).textContent = finlandMedals.rank;
    finlandRow.insertCell(1).textContent = finlandMedals.gold;
    finlandRow.insertCell(2).textContent = finlandMedals.silver;
    finlandRow.insertCell(3).textContent = finlandMedals.bronze;
    
    // Calculate total
    const finlandTotal = finlandMedals.gold + finlandMedals.silver + finlandMedals.bronze;
    
    // Only add the total cell if the table has a total column
    const hasTotal = document.querySelector('#finland-medal-tally thead th:nth-child(5)');
    if (hasTotal) {
        finlandRow.insertCell(4).textContent = finlandTotal;
    }

    // Display India's medals
    const indiaMedals = medalData.IND;
    const indiaRow = indiaTableBody.insertRow();
    indiaRow.insertCell(0).textContent = indiaMedals.rank;
    indiaRow.insertCell(1).textContent = indiaMedals.gold;
    indiaRow.insertCell(2).textContent = indiaMedals.silver;
    indiaRow.insertCell(3).textContent = indiaMedals.bronze;
    
    // Calculate total
    const indiaTotal = indiaMedals.gold + indiaMedals.silver + indiaMedals.bronze;
    
    // Only add the total cell if the table has a total column
    const hasIndiaTotal = document.querySelector('#india-medal-tally thead th:nth-child(5)');
    if (hasIndiaTotal) {
        indiaRow.insertCell(4).textContent = indiaTotal;
    }
});
