# Rock · Paper · Scissors (1v1)

A two-player, same-device Rock-Paper-Scissors game built with plain HTML, CSS, and JavaScript.

## How to play
1. Open `index.html` in a browser, enter both names, click **Start Game** (or press Enter).
2. Player 1 picks secretly, then Player 2 picks (click a hand, or press **R / P / S**).
3. The game counts down "Rock... Paper... Scissors... SHOOT!" and reveals both hands.
4. Rock beats Scissors, Scissors beats Paper, Paper beats Rock. Same pick = tie.
5. First player to **3 round wins** takes the match. Then play a rematch or change players.

## Features
- Screens that change as you play: setup, pick, countdown, reveal, final result
- Effects: lock-in glow + ripple on your choice, shaking fists, hands slamming in, color flash, confetti, sound beeps
- Score pips, round history, light/dark mode, sound on/off, keyboard shortcuts, responsive layout

## Database (Supabase)
Finished matches are saved to an online Supabase database. The **Leaderboard** screen reads them back
(top players + match history) and lets you delete a match.

Setup:
1. Create a free project at supabase.com.
2. **SQL Editor** → paste `schema.sql` → **Run** (creates the `matches` table).
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key into `config.js`.
4. Refresh the game. After a match ends you should see "Result saved to the database."
   Check it in Supabase under **Table Editor → matches**.

Never put the `service_role` key in this project. Without keys the game still plays; it just doesn't save.

### Database structure — table `matches`
| column | type | meaning |
|---|---|---|
| id | uuid (primary key) | unique id of the match |
| player1, player2 | text | player names |
| score1, score2 | int | round wins of each player |
| winner | text | name of the match winner |
| rounds | jsonb | every round: `[{a, b, result}, ...]` |
| created_at | timestamptz | when the match was saved |

## Files
- `index.html` – page structure
- `style.css` – colors, layout, animations
- `config.js` – your Supabase URL + anon key
- `schema.sql` – creates the database table
- `script.js` – game logic + database calls (`Player` class, `getRoundResult()`, `pick()`, `playRound()`, `saveMatch()`, `render()`)

## Run online (GitHub Pages)
Repo **Settings → Pages → Deploy from a branch → main / (root)**.
