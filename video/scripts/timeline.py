"""Shared timeline + copy deck for the Alzheimer's caregiver film."""

FPS = 30
W, H = 1920, 1080

XFADE = 0.62

INTRO_LEN = 15.2
TIP_START = 14.4
TIP_STEP = 9.2
TIP_LEN = 10.0
NUM_TIPS = 10
OUTRO_START = TIP_START + TIP_STEP * (NUM_TIPS - 1) + TIP_LEN - XFADE  # 106.4
OUTRO_LEN = 17.6
TOTAL = OUTRO_START + OUTRO_LEN  # 124.0

COL = {
    "ink": (5, 11, 14),
    "cream": (247, 240, 230),
    "amber": (232, 179, 122),
    "amber_hi": (255, 205, 152),
    "muted": (203, 200, 188),
    "teal": (14, 58, 63),
}

INTRO_LINES = [
    "Some memories fade.",
    "The person doesn't.",
]

INTRO_EYEBROW = "A CAREGIVER'S FIELD GUIDE"
INTRO_TITLE_A = "10 BEST TIPS"
INTRO_TITLE_B = "TO DEAL WITH ALZHEIMER'S"
INTRO_SUB = "Small changes. Real relief. More moments that feel like them."

TIPS = [
    dict(
        plate="06_routine.png",
        title="Keep a calm,\nfamiliar routine",
        body="Same time, same place, same steps. Predictability quietly lowers confusion \u2014 and fear.",
        side="left",
    ),
    dict(
        plate="07_safety.png",
        title="Make home safe\nand simple",
        body="Nightlights, clear paths, a handrail where it matters. Remove the clutter, keep the dignity.",
        side="left",
    ),
    dict(
        plate="08_talk.png",
        title="Speak with warmth,\nnot correction",
        body="Don't argue with the story \u2014 join it. One question at a time. A hand on theirs. Their name in your voice.",
        side="left",
    ),
    dict(
        plate="05_music.png",
        title="Let music\nbring them back",
        body="A song from their twenties can open a door no question can. Keep the old records close.",
        side="left",
    ),
    dict(
        plate="09_garden.png",
        title="Move a little,\nevery day",
        body="A short walk, a stretch, a dance in the kitchen. Movement steadies mood, sleep and balance.",
        side="right",
    ),
    dict(
        plate="10_choices.png",
        title="Simplify\nthe choices",
        body="Two shirts, not ten. Two options, not an open question. Independence survives on smaller decisions.",
        side="right",
    ),
    dict(
        plate="03_kitchen.png",
        title="Guard the meals\nand the water",
        body="Set the table, turn off the noise, offer water often. Thirst and hunger are forgotten early.",
        side="right",
    ),
    dict(
        plate="04_walk.png",
        title="Plan early \u2014\ntogether",
        body="Money, medication, legal wishes, care preferences. Decide while their voice can still lead the room.",
        side="right",
    ),
    dict(
        plate="02_hands.png",
        title="Build a care team,\nthen use it",
        body="You cannot be the whole circle. Respite care, support groups, siblings, neighbours. Let people help.",
        side="left",
    ),
    dict(
        plate="01_window.png",
        title="Be patient\nwith yourself",
        body="Some days will go backwards. That isn't failure \u2014 that's the disease. Your calm is still medicine.",
        side="left",
    ),
]

OUTRO_LINES = [
    (1.1, "There is no cure. Not yet."),
    (4.0, "But there is care."),
    (5.5, "There is patience."),
    (7.0, "And there is love."),
]
OUTRO_CTA_H = 11.0
OUTRO_DISC = "Not medical advice. Always consult a qualified healthcare professional."
OUTRO_TAG = "Share this with someone who cares for someone."


def tip_start(i: int) -> float:
    return TIP_START + TIP_STEP * i
