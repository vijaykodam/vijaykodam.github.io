/**
 * LLM Pricing Table
 * Fetches and displays pricing data for LLM providers with sortable columns.
 */

document.addEventListener('DOMContentLoaded', function() {
    const container = document.getElementById('llm-pricing-container');
    if (!container) return;

    const loadingEl = document.getElementById('llm-pricing-loading');
    const errorEl = document.getElementById('llm-pricing-error');
    const tableEl = document.getElementById('llm-pricing-table');
    const tbodyEl = document.getElementById('llm-pricing-tbody');
    const lastCheckedEl = document.getElementById('llm-pricing-last-checked');
    const lastUpdatedEl = document.getElementById('llm-pricing-last-updated');

    let pricingData = [];
    let currentSort = { column: 'provider', ascending: true };

    // Format price as $X.XX or N/A
    function formatPrice(price) {
        if (price === null || price === undefined) {
            return 'N/A';
        }
        // Format with appropriate decimal places
        if (price >= 1) {
            return '$' + price.toFixed(2);
        } else if (price >= 0.1) {
            return '$' + price.toFixed(2);
        } else {
            return '$' + price.toFixed(3);
        }
    }

    // Format date for display
    function formatDate(isoString) {
        if (!isoString) return 'Unknown';
        const date = new Date(isoString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    }

    // Flatten pricing data for table display
    function flattenData(data) {
        const rows = [];
        if (!data || !data.providers) return rows;

        data.providers.forEach(function(provider) {
            provider.models.forEach(function(model) {
                rows.push({
                    provider: provider.name,
                    model: model.model,
                    input: model.input,
                    cache_input: model.cache_input,
                    output: model.output
                });
            });
        });
        return rows;
    }

    // Sort data by column
    function sortData(data, column, ascending) {
        return data.slice().sort(function(a, b) {
            let valA = a[column];
            let valB = b[column];

            // Handle null values - put them at the end
            if (valA === null || valA === undefined) valA = ascending ? Infinity : -Infinity;
            if (valB === null || valB === undefined) valB = ascending ? Infinity : -Infinity;

            // String comparison for text columns
            if (typeof valA === 'string' && typeof valB === 'string') {
                return ascending
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA);
            }

            // Numeric comparison
            if (ascending) {
                return valA - valB;
            } else {
                return valB - valA;
            }
        });
    }

    // Render table rows
    function renderTable(data) {
        tbodyEl.innerHTML = '';

        data.forEach(function(row) {
            const tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + row.provider + '</td>' +
                '<td>' + row.model + '</td>' +
                '<td>' + formatPrice(row.input) + '</td>' +
                '<td>' + formatPrice(row.cache_input) + '</td>' +
                '<td>' + formatPrice(row.output) + '</td>';
            tbodyEl.appendChild(tr);
        });
    }

    // Update sort indicators in headers
    function updateSortIndicators() {
        const headers = tableEl.querySelectorAll('th[data-sort]');
        headers.forEach(function(th) {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sort === currentSort.column) {
                th.classList.add(currentSort.ascending ? 'sort-asc' : 'sort-desc');
            }
        });
    }

    // Handle column header clicks for sorting
    function setupSorting() {
        const headers = tableEl.querySelectorAll('th[data-sort]');
        headers.forEach(function(th) {
            th.addEventListener('click', function() {
                const column = th.dataset.sort;

                // Toggle direction if same column, otherwise default to ascending
                if (currentSort.column === column) {
                    currentSort.ascending = !currentSort.ascending;
                } else {
                    currentSort.column = column;
                    currentSort.ascending = true;
                }

                const sortedData = sortData(pricingData, currentSort.column, currentSort.ascending);
                renderTable(sortedData);
                updateSortIndicators();
            });
        });
    }

    // Fetch and display pricing data
    async function loadPricingData() {
        try {
            // Fetch both files in parallel
            const [pricingResponse, metadataResponse] = await Promise.all([
                fetch('/data/llm-pricing/current.json'),
                fetch('/data/llm-pricing/metadata.json')
            ]);

            if (!pricingResponse.ok) {
                throw new Error('Failed to fetch pricing data');
            }

            const pricing = await pricingResponse.json();
            const metadata = metadataResponse.ok ? await metadataResponse.json() : {};

            // Update metadata display
            if (lastCheckedEl && metadata.last_checked) {
                lastCheckedEl.textContent = 'Last checked: ' + formatDate(metadata.last_checked);
            }
            if (lastUpdatedEl && metadata.last_updated) {
                lastUpdatedEl.textContent = 'Prices last changed: ' + formatDate(metadata.last_updated);
            }

            // Process and display pricing data
            pricingData = flattenData(pricing);
            const sortedData = sortData(pricingData, currentSort.column, currentSort.ascending);

            renderTable(sortedData);
            updateSortIndicators();
            setupSorting();

            // Show table, hide loading
            loadingEl.style.display = 'none';
            tableEl.style.display = 'table';

        } catch (error) {
            console.error('Error loading pricing data:', error);
            loadingEl.style.display = 'none';
            errorEl.style.display = 'block';
        }
    }

    // Initialize
    loadPricingData();
});
