export type DailyReflectionPrompt = {
    id: string;
    text: string;
};

export const DAILY_REFLECTION_PROMPTS: DailyReflectionPrompt[] = [
    { id: "peach-pit", text: "What was your peach and pit today?" },
    { id: "funny-moment", text: "What made you laugh today?" },
    { id: "best-bite", text: "What was the best thing you ate today?" },
    { id: "stuck-song", text: "What song got stuck in your head?" },
    { id: "plot-twist", text: "What was the biggest plot twist of your day?" },
    { id: "tiny-win", text: "What tiny win are you weirdly proud of?" },
    { id: "best-meme", text: "What's the best meme you saw today?" },
    { id: "random-thing", text: "What's the most random thing that happened?" },
    { id: "unexpected-good", text: "What went better than you expected?" },
    { id: "learned", text: "What random fact did you learn today?" },
    { id: "day-title", text: "If today had a title, what would it be?" },
    // { id: "helped-you", text: "Who made your day a little easier?" },
    { id: "reset", text: "What helped you reset today?" },
    { id: "neat-moment", text: "What made you go 'huh, neat' today?" },
    { id: "tomorrow", text: "What are you looking forward to tomorrow?" },
    // {
    //     id: "waste-of-time",
    //     text: "What was your favorite waste of time today?",
    // },
    // { id: "small-talk", text: "What's the weirdest small talk you had?" },
    {
        id: "internet-hole",
        text: "What internet rabbit hole did you fall into?",
    },
    // { id: "unread-messages", text: "How many unread messages do you have?" },
    { id: "shout-out", text: "Who deserves a shout-out today?" },
    {
        id: "quote",
        text: "What quote did you hear or read recently that stuck with you?",
    },
    {
        id: "pic-of-the-day",
        text: "What was the best picture you took recently?",
    },
    {
        id: "in-the-middle",
        text: "What show, book, or podcast are you in the middle of?",
    },
    { id: "googled", text: "What's the weirdest thing you googled today?" },
    { id: "went-somewhere", text: "Where'd you go today, even briefly?" },
    {
        id: "recommend",
        text: "What music, movie, book, etc. would you recommend to a friend right now?",
    },
    { id: "texted-most", text: "Who did you text the most today?" },
    { id: "childhood-picture", text: "Post a picture from your childhood." },
    { id: "good-memory", text: "What was a good memory you remembered today?" },
    {
        id: "alternate-career",
        text: "If you had a different career, what would it be? (if money and schooling were not factors)",
    },
    // {
    //     id: "top-skill",
    //     text: "Your life depends on beating a random stranger at one skill — what do you pick?",
    // },
    {
        id: "nicest-thing",
        text: "What's the nicest thing someone said to you today?",
    },
    {
        id: "past-you",
        text: "What would 5-years-ago you be surprised to see you doing?",
    },
    // { id: "un-invent", text: "If you could un-invent one thing, what would it be?" },
    { id: "made-you-old", text: "What made you feel old today?" },
    // { id: "first-thing", text: "What was the first thing you thought of when you woke up?" },
    {
        id: "grateful-weird",
        text: "What's something oddly specific you're grateful for?",
    },
    // { id: "spent-money", text: "What's the last thing you spent money on?" },
    // { id: "overheard-two", text: "What's a sentence you heard out of context today?" },
];

export function getDailyReflectionDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getDailyReflectionPrompt(date = new Date()) {
    const start = Date.UTC(date.getFullYear(), 0, 0);
    const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const dayOfYear = Math.floor((today - start) / 86_400_000);
    return DAILY_REFLECTION_PROMPTS[
        Math.abs(dayOfYear) % DAILY_REFLECTION_PROMPTS.length
    ];
}
