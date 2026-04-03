/**
 * ICM Calculator Logic & UI Management
 */

// --- ICM Engine ---
function calculateICM(stacks, payouts) {
    const n = stacks.length;
    const m = payouts.length;
    // Pad payouts with 0 for players who get nothing
    const fullPayouts = [...payouts, ...new Array(Math.max(0, n - m)).fill(0)];
    
    // Cache for memoization: subset key -> Dict[index: EV]
    const cache = new Map();

    function computeEVs(playerIndices, payoutIdx) {
        // Create a unique key for current subset + current prize index
        const key = Array.from(playerIndices).sort((a, b) => a - b).join(',') + '|' + payoutIdx;
        if (cache.has(key)) return cache.get(key);

        const numPlayers = playerIndices.length;
        
        // Base case: No players left
        if (numPlayers === 0) return {};
        
        // Base case: No more prize money left
        if (payoutIdx >= n) {
            const res = {};
            playerIndices.forEach(idx => res[idx] = 0);
            return res;
        }

        // Base case: Only one player left (gets all remaining prizes)
        if (numPlayers === 1) {
            const idx = playerIndices[0];
            let remainingSum = 0;
            for (let i = payoutIdx; i < fullPayouts.length; i++) {
                remainingSum += fullPayouts[i];
            }
            return { [idx]: remainingSum };
        }

        const subsetTotalChips = playerIndices.reduce((sum, idx) => sum + stacks[idx], 0);
        const currentEVs = {};
        playerIndices.forEach(idx => currentEVs[idx] = 0);

        // Safety: If all remaining have 0 chips, split prizes evenly
        if (subsetTotalChips === 0) {
            let remainingSum = 0;
            for (let i = payoutIdx; i < fullPayouts.length; i++) {
                remainingSum += fullPayouts[i];
            }
            const share = remainingSum / numPlayers;
            playerIndices.forEach(idx => currentEVs[idx] = share);
            return currentEVs;
        }

        const currentPrize = fullPayouts[payoutIdx];

        // For each player in the subset, calculate if they win the *current* prize
        for (let i = 0; i < playerIndices.length; i++) {
            const p = playerIndices[i];
            const probWinsCurrent = stacks[p] / subsetTotalChips;
            
            // Sub-problem: others compete for the rest of the prizes
            const remainingPlayers = playerIndices.filter(idx => idx !== p);
            const subResults = computeEVs(remainingPlayers, payoutIdx + 1);
            
            // Add p's win value
            currentEVs[p] += probWinsCurrent * currentPrize;
            
            // Add p's contribution to others' EV
            for (const q in subResults) {
                currentEVs[q] += probWinsCurrent * subResults[q];
            }
        }

        cache.set(key, currentEVs);
        return currentEVs;
    }

    const allIndices = Array.from({length: n}, (_, i) => i);
    const resultDict = computeEVs(allIndices, 0);
    return allIndices.map(i => resultDict[i]);
}

// --- UI Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const payoutList = document.getElementById('payout-list');
    const playerList = document.getElementById('player-list');
    const resultList = document.getElementById('result-list');
    const resultsDisplay = document.getElementById('results-display');
    const totalPayoutDisplay = document.getElementById('total-payout-display');

    let payoutCount = 0;
    let playerCount = 0;

    function createPayoutRow(value = "") {
        payoutCount++;
        const div = document.createElement('div');
        div.className = 'input-row';
        div.innerHTML = `
            <label>${payoutCount}位</label>
            <input type="number" class="payout-input" placeholder="賞金" value="${value}" step="any">
            <button class="btn-remove">×</button>
        `;
        div.querySelector('.btn-remove').onclick = () => {
            div.remove();
            updatePayoutLabels();
        };
        payoutList.appendChild(div);
    }

    function updatePayoutLabels() {
        const rows = payoutList.querySelectorAll('.input-row');
        payoutCount = 0;
        rows.forEach(row => {
            payoutCount++;
            row.querySelector('label').innerText = `${payoutCount}位`;
        });
    }

    function createPlayerRow(name = "", stack = "") {
        playerCount++;
        const div = document.createElement('div');
        div.className = 'input-row';
        div.style.gridTemplateColumns = '1fr 100px 40px';
        div.innerHTML = `
            <input type="text" class="player-name" placeholder="Player ${playerCount}" value="${name}">
            <input type="number" class="player-stack" placeholder="Stack" value="${stack}" step="any">
            <button class="btn-remove">×</button>
        `;
        div.querySelector('.btn-remove').onclick = () => {
            div.remove();
        };
        playerList.appendChild(div);
    }

    // Default Startup
    createPayoutRow("50");
    createPayoutRow("30");
    createPayoutRow("20");
    
    createPlayerRow("", "50");
    createPlayerRow("", "30");
    createPlayerRow("", "20");

    document.getElementById('add-payout').onclick = () => createPayoutRow();
    document.getElementById('add-player').onclick = () => createPlayerRow();

    document.getElementById('calc-btn').onclick = () => {
        const payoutInputs = document.querySelectorAll('.payout-input');
        const payouts = Array.from(payoutInputs).map(i => parseFloat(i.value) || 0);

        const playerNames = Array.from(document.querySelectorAll('.player-name')).map((i, idx) => i.value || `Player ${idx+1}`);
        const playerStacks = Array.from(document.querySelectorAll('.player-stack')).map(i => parseFloat(i.value) || 0);

        if (playerStacks.length === 0 || payouts.length === 0) {
            alert("プレイヤーと賞金を1つ以上追加してください。");
            return;
        }

        const evs = calculateICM(playerStacks, payouts);
        const totalPrize = payouts.reduce((a, b) => a + b, 0);

        // Display results
        resultList.innerHTML = '';
        evs.forEach((ev, idx) => {
            const card = document.createElement('div');
            card.className = 'res-card';
            const percent = totalPrize > 0 ? ((ev / totalPrize) * 100).toFixed(1) : 0;
            card.innerHTML = `
                <div>
                    <div class="res-player">${playerNames[idx]}</div>
                    <div class="res-meta">スタック: ${playerStacks[idx]}</div>
                </div>
                <div style="text-align: right">
                    <div class="res-ev">${ev.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                    <div class="res-meta">${percent}% of Pool</div>
                </div>
            `;
            resultList.appendChild(card);
        });

        totalPayoutDisplay.innerText = totalPrize.toLocaleString();
        resultsDisplay.classList.remove('hidden');
        resultsDisplay.scrollIntoView({ behavior: 'smooth' });
    };
});
