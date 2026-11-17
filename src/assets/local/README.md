# Your own sounds (not uploaded to GitHub)

Put these files in this folder and the game uses them. Git ignores everything here except this README, so
they stay on your computer and are not published with the repo.

| File name            | Plays when                                  | Without it                 |
|----------------------|---------------------------------------------|----------------------------|
| `white-scream.mp3`   | the white robot gets you                    | the normal scream          |
| `power-out.mp3`      | the power runs out (stops at the scare)     | a synthesized music box    |
| `camera.mp3`         | you switch cameras                          | a burst of static          |
| `i-see-you.mp3`      | C.A.I.-0 whispers "I see you."              | a breath and a low tone    |
| `night-complete.mp3` | the clock reaches 2:00 AM                   | a short synthesized chime  |

The names must match exactly. Restart `npm run dev` after adding or removing a file.

Why they are kept out of the repo: these are meant for sounds you do not have the rights to publish, such as
clips from other games. Sounds you made yourself or have a licence to share can go in `src/assets/` instead.
