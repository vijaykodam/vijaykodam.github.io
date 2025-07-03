document.addEventListener('DOMContentLoaded', () => {
    const board = document.getElementById('game-board');
    const cells = document.querySelectorAll('.cell');
    const messageElement = document.getElementById('message');
    const restartButton = document.getElementById('restart-game');
    const startButton = document.getElementById('start-game');
    const gameSetup = document.getElementById('game-setup');
    const gameModeSelector = document.getElementById('game-mode-selector');
    const firstMoveContainer = document.getElementById('first-move-container');
    const firstMoveSelector = document.getElementById('first-move-selector');

    let currentPlayer;
    let boardState = ['', '', '', '', '', '', '', '', ''];
    let gameActive = false;
    let gameMode = 'pvc';
    let firstMove = 'player';
    const playerXSymbol = 'x';
    const playerOSymbol = 'o';

    const winningConditions = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
        [0, 4, 8], [2, 4, 6]             // Diagonals
    ];

    function updateMessage(message) {
        messageElement.textContent = message;
    }

    function handleCellClick(clickedCellEvent) {
        const clickedCell = clickedCellEvent.target;
        const clickedCellIndex = parseInt(clickedCell.getAttribute('data-index'));

        if (boardState[clickedCellIndex] !== '' || !gameActive) {
            return;
        }

        if (gameMode === 'pvc' && currentPlayer !== playerXSymbol) {
            return;
        }

        handleMove(clickedCellIndex, currentPlayer);

        if (gameActive) {
            if (gameMode === 'pvc') {
                currentPlayer = playerOSymbol;
                updateMessage("Computer's turn...");
                setTimeout(computerMove, 500);
            } else { // pvp
                currentPlayer = currentPlayer === playerXSymbol ? playerOSymbol : playerXSymbol;
                updateMessage(`Player ${currentPlayer.toUpperCase()}'s turn`);
            }
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
            return combination.every(index => boardState[index] === symbol);
        });
    }

    function isBoardFull() {
        return boardState.every(cell => cell !== '');
    }

    function computerMove() {
        if (!gameActive || gameMode !== 'pvc') return;

        let move = findBestMove();
        handleMove(move, playerOSymbol);

        if (gameActive) {
            currentPlayer = playerXSymbol;
            updateMessage('Your turn');
        }
    }

    function findBestMove() {
        for (let i = 0; i < 9; i++) {
            if (boardState[i] === '') {
                boardState[i] = playerOSymbol;
                if (checkWin(playerOSymbol)) {
                    boardState[i] = ''; return i;
                }
                boardState[i] = '';
            }
        }
        for (let i = 0; i < 9; i++) {
            if (boardState[i] === '') {
                boardState[i] = playerXSymbol;
                if (checkWin(playerXSymbol)) {
                    boardState[i] = ''; return i;
                }
                boardState[i] = '';
            }
        }
        if (boardState[4] === '') return 4;
        const corners = [0, 2, 6, 8].filter(i => boardState[i] === '');
        if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
        const sides = [1, 3, 5, 7].filter(i => boardState[i] === '');
        if (sides.length > 0) return sides[Math.floor(Math.random() * sides.length)];
        
        return boardState.findIndex(cell => cell === '');
    }

    function endGame(draw) {
        gameActive = false;
        if (draw) {
            updateMessage("It's a draw!");
        } else {
            if (gameMode === 'pvc') {
                updateMessage(currentPlayer === playerXSymbol ? 'You win!' : 'Computer wins!');
            } else {
                updateMessage(`Player ${currentPlayer.toUpperCase()} wins!`);
            }
        }
        restartButton.classList.remove('hidden');
    }

    function startGame() {
        gameActive = true;
        boardState = ['', '', '', '', '', '', '', '', ''];
        cells.forEach(cell => {
            cell.classList.remove(playerXSymbol, playerOSymbol);
        });
        
        gameSetup.classList.add('hidden');
        board.classList.remove('hidden');
        messageElement.classList.remove('hidden');
        restartButton.classList.add('hidden');

        if (gameMode === 'pvc') {
            currentPlayer = firstMove === 'player' ? playerXSymbol : playerOSymbol;
            if (currentPlayer === playerOSymbol) {
                updateMessage("Computer's turn...");
                setTimeout(computerMove, 500);
            } else {
                updateMessage('Your turn');
            }
        } else { // pvp
            currentPlayer = playerXSymbol;
            updateMessage("Player X's turn");
        }
    }

    function restartGame() {
        gameActive = false;
        boardState = ['', '', '', '', '', '', '', '', ''];
        cells.forEach(cell => {
            cell.classList.remove(playerXSymbol, playerOSymbol);
        });
        gameSetup.classList.remove('hidden');
        board.classList.add('hidden');
        messageElement.classList.add('hidden');
        restartButton.classList.add('hidden');
    }

    gameModeSelector.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            gameMode = e.target.dataset.mode;
            gameModeSelector.querySelector('.active').classList.remove('active');
            e.target.classList.add('active');

            if (gameMode === 'pvp') {
                firstMoveContainer.classList.add('hidden');
            } else {
                firstMoveContainer.classList.remove('hidden');
            }
        }
    });

    firstMoveSelector.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            firstMove = e.target.dataset.firstMove;
            firstMoveSelector.querySelector('.active').classList.remove('active');
            e.target.classList.add('active');
        }
    });

    cells.forEach(cell => cell.addEventListener('click', handleCellClick));
    restartButton.addEventListener('click', restartGame);
    startButton.addEventListener('click', startGame);
});