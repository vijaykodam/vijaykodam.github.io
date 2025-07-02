document.addEventListener('DOMContentLoaded', () => {
    const board = document.getElementById('game-board');
    const cells = document.querySelectorAll('.cell');
    const messageElement = document.getElementById('message');
    const restartButton = document.getElementById('restart-game');
    const startButton = document.getElementById('start-game');
    const gameSetup = document.getElementById('game-setup');
    const firstMoveSelector = document.getElementById('first-move');

    let currentPlayer;
    let boardState = ['', '', '', '', '', '', '', '', ''];
    let gameActive = false;
    const playerSymbol = 'x';
    const computerSymbol = 'o';

    const winningConditions = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6]
    ];

    function updateMessage(message) {
        messageElement.textContent = message;
    }

    function handleCellClick(clickedCellEvent) {
        const clickedCell = clickedCellEvent.target;
        const clickedCellIndex = parseInt(clickedCell.getAttribute('data-index'));

        if (boardState[clickedCellIndex] !== '' || !gameActive || currentPlayer !== playerSymbol) {
            return;
        }

        handleMove(clickedCellIndex, playerSymbol);

        if (gameActive) {
            currentPlayer = computerSymbol;
            updateMessage(`Computer's turn...`);
            setTimeout(computerMove, 500);
        }
    }

    function handleMove(index, symbol) {
        boardState[index] = symbol;
        cells[index].classList.add(symbol);
        if (checkWin(symbol)) {
            endGame(false);
        } else if (isBoardFull()) {
            endGame(true);
        }
    }

    function checkWin(symbol) {
        return winningConditions.some(combination => {
            return combination.every(index => {
                return boardState[index] === symbol;
            });
        });
    }

    function isBoardFull() {
        return boardState.every(cell => cell !== '');
    }

    function computerMove() {
        if (!gameActive) return;

        let move = findBestMove();
        handleMove(move, computerSymbol);

        if (gameActive) {
            currentPlayer = playerSymbol;
            updateMessage('Your turn');
        }
    }

    function findBestMove() {
        // 1. Check if computer can win
        for (let i = 0; i < 9; i++) {
            if (boardState[i] === '') {
                boardState[i] = computerSymbol;
                if (checkWin(computerSymbol)) {
                    boardState[i] = ''; // backtrack
                    return i;
                }
                boardState[i] = ''; // backtrack
            }
        }

        // 2. Check if player can win and block
        for (let i = 0; i < 9; i++) {
            if (boardState[i] === '') {
                boardState[i] = playerSymbol;
                if (checkWin(playerSymbol)) {
                    boardState[i] = ''; // backtrack
                    return i;
                }
                boardState[i] = ''; // backtrack
            }
        }

        // 3. Take center if available
        if (boardState[4] === '') {
            return 4;
        }

        // 4. Take a random corner
        const corners = [0, 2, 6, 8];
        const availableCorners = corners.filter(index => boardState[index] === '');
        if (availableCorners.length > 0) {
            return availableCorners[Math.floor(Math.random() * availableCorners.length)];
        }

        // 5. Take a random side
        const sides = [1, 3, 5, 7];
        const availableSides = sides.filter(index => boardState[index] === '');
        if (availableSides.length > 0) {
            return availableSides[Math.floor(Math.random() * availableSides.length)];
        }
        
        // Fallback to first available spot (should not be reached in a normal game)
        return boardState.findIndex(cell => cell === '');
    }

    function endGame(draw) {
        gameActive = false;
        if (draw) {
            updateMessage("It's a draw!");
        } else {
            updateMessage(`${currentPlayer === playerSymbol ? 'You win!' : 'Computer wins!'}`);
        }
        restartButton.classList.remove('hidden');
    }

    function startGame() {
        gameActive = true;
        boardState = ['', '', '', '', '', '', '', '', ''];
        cells.forEach(cell => {
            cell.classList.remove(playerSymbol, computerSymbol);
        });
        
        gameSetup.classList.add('hidden');
        board.classList.remove('hidden');
        messageElement.classList.remove('hidden');
        restartButton.classList.add('hidden');

        currentPlayer = firstMoveSelector.value === 'player' ? playerSymbol : computerSymbol;

        if (currentPlayer === computerSymbol) {
            updateMessage("Computer's turn...");
            setTimeout(computerMove, 500);
        } else {
            updateMessage('Your turn');
        }
    }

    function restartGame() {
        gameSetup.classList.remove('hidden');
        board.classList.add('hidden');
        messageElement.classList.add('hidden');
        restartButton.classList.add('hidden');
    }

    cells.forEach(cell => cell.addEventListener('click', handleCellClick));
    restartButton.addEventListener('click', restartGame);
    startButton.addEventListener('click', startGame);
});