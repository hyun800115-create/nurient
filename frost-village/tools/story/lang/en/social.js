// English: romance, quarrels and making up, invitations, jokes (gentle puns), live incident shouts
// (cute and comic), and lines residents say to the chief when tapped.

export default {
  // ---------------------------------------------------------------- romance
  flirt: [
    '*2 [You look extra nice today.|You look extra nice today.|You look very well today.]', '[Time flies when I talk with you.|Time flies when we talk.|Time passes so quickly in your company.]',
    '[You like {H}? I’ve been getting into it too!|You like {H}? I’ve become interested too!|You enjoy {H}? I have taken an interest too.]', '[That scarf really suits you.|That scarf really suits you.|That scarf suits you.]',
    '?=q =invite? [Wanna {A} together sometime?|Would you like to {A} together sometime?|Might we {A} together sometime?]', '?romantic? *2 [The snowflakes in your hair look like a crown.|Snowflakes in your hair look like a crown.|The snow looks like a crown on you.]',
    '?shy? [Um… nice weather, huh?|Um… nice weather, isn’t it?|Um… lovely weather…]', '?funny? [Are you a heater? It’s so warm next to you!|Are you a heater? It’s warm next to you!|It is warm beside you.]',
  ],
  'flirt.re': ['*2 [Hehe, really?|Hehe, really?|Oh my, really?]', '[You look nice too!|You look nice too!|You look very well too.]', '?shy? *2 [Oh, uh… th-thanks…|Oh… th-thank you…|Oh… thank you…]', '?^invite? *6 [Sure! Let’s go!|Sure, let’s go!|With pleasure.]', '[My face is red? It’s just the cold!|Is my face red? It’s the cold!|It must be the cold.]'],
  'flirt.oblivious': ['*2 [Huh? Oh, thanks! I’m hungry, though.|Oh? Thanks! I’m hungry, though.|Is that so? Thank you.]', '[What? Anyway, thanks!|Pardon? Well, thank you!|Oh, yes, thank you.]', '[A heater? If you’re cold, the campfire’s over there!|A heater? The campfire is over there if you’re cold!|The fire is that way if you are cold.]'],
  confess: [
    '*3 [I… I like you. Will you go out with me?|I… I like you. Would you go out with me?|I am fond of you. Would you walk out with me?]', '[You’re all I think about. Let’s be together!|I think of you every day. Let’s be together!|I think of you every day.]',
    '?romantic? [I like you more than {H}. I mean it.|I like you more than {H}. Truly.|I mean it with all my heart.]', '?shy? [U-um… I think I like you…!|U-um… I think I like you…!|I… I like you…!]',
  ],
  'confess.yes': ['*3 [I… I liked you too!|I liked you too!|I liked you too!]', '[Yes! Let’s go out!|Yes! Let’s be together!|Yes, gladly.]', '?shy? [Y-yes… okay…|Y-yes…|Yes…]', '[I was waiting for you to say it!|I was waiting for you to say it!|I was hoping you would.]'],
  'confess.no': ['*3 [Sorry… let’s stay good friends.|I’m sorry… let’s stay good friends.|Forgive me… let us remain friends.]', '[Thank you. But I’m not sure yet…|Thank you, but I’m not sure yet…|Thank you, but I am not certain yet.]'],
  propose: ['*3 [Will you marry me? I’ll keep you warm forever!|Will you marry me? I’ll keep you warm forever!|Will you marry me?]', '[This ring… will you take it?|Will you accept this ring?|Will you accept this ring?]', '[Let’s have our wedding at the town hall!|Let’s get married at the town hall!|Let us marry at the town hall.]'],
  'propose.yes': ['*3 [Yes! Yes! Let’s get married!|Yes! Let’s get married!|Yes, I will!]', '[I’m going to cry… of course!|I could cry… of course!|Of course!]'],
  sweet: [
    '?=miss? *2 [I missed you!|I missed you!|I missed you.]', '?=q =cold? [Cold hands? Put them in my pocket.|Are your hands cold? Put them in my pocket.|Your hands are cold. Use my pocket.]', '?=happy? [I’m never cold when I’m with you.|I’m never cold with you.|I am warm in your company.]',
    '?=invite? [Let’s go stargazing next time.|Let’s go stargazing sometime.|Let us go stargazing.]', '?=q =food? [Wanna share a fish bun?|Shall we share a fish bun?|Would you share a fish bun?]', '?romantic =miss? [I think of you more when it snows.|I think of you more on snowy days.|Snow makes me think of you.]',
    '?=praise? [That scarf looks so good on you.|That scarf looks lovely on you.|The scarf suits you so well.]', '?=q =invite? [Wanna go to the ice rink later?|Shall we go to the ice rink later?|Shall we visit the ice rink?]',
    '?=q =oldq? [Remember the day we met?|Do you remember the day we met?|Do you remember when we met?]', '?=gift? [I got this for you. A hand warmer!|I bought you this — a hand warmer!|A hand warmer, for you.]',
  ],
  'sweet.re': [
    '?^miss? *8 [Me too!|Me too!|So did I.]', '?^miss? *4 [I thought about you all day.|I thought of you all day.|I thought of you too.]', '?^cold? *8 [Hehe, so warm!|Hehe, it’s warm!|How warm.]', '?^happy? *8 [Me too.|Me too.|As am I.]', '?^invite? *8 [Yes! Let’s go!|Yes! Let’s go!|Gladly.]',
    '?^food? *8 [Yes! Give me the tail!|Yes! I’ll take the tail!|Yes, please.]', '?^praise? *8 [You picked it out!|You chose it for me!|You chose it.]', '?^oldq? *8 [Of course! It was snowing so hard.|Of course! It was snowing hard.|Of course; it was snowing.]',
    '?^gift? *8 [Aww, thank you! I’ll treasure it.|Oh, thank you! I’ll treasure it.|Thank you. I shall treasure it.]', '*1 [Hehe, okay!|Hehe, okay!|All right.]',
  ],
  'sweet.married': [
    '?=q =dinner? *3 [{V}, what should we have for dinner?|{V}, what shall we have for dinner?|{V}, what would you like for supper?]', '?=invite? [{V}, let’s go shopping together.|{V}, let’s go shopping together.|{V}, shall we shop together?]', '?=praise? [{V}, you look extra handsome today.|{V}, you look lovely today.|You look very fine today.]',
    '?haskids =hw? [I should check the kids’ homework.|I’d better check the kids’ homework.|I shall check the children’s homework.]', '?elder =q =oldq? [{V}, remember when we were young?|{V}, do you remember our younger days?|Do you remember our youth?]',
    '?=q =save? [{V}, how much did we save this month?|{V}, how much did we save this month?|How much have we saved this month?]', '?=tired? [{V}, you look tired today.|{V}, you look tired today.|You look tired today.]', '?=happy? [I’m so glad I married you.|I’m so happy with you.|I am so glad we are together.]',
  ],
  'sweet.married.re': [
    '?^dinner? *8 [How about your favourite, grilled fish?|How about your favourite grilled fish?|Grilled fish, perhaps?]', '?^dinner? *5 [I’ll make fishcake soup tonight!|I’ll make fishcake soup!|I shall make fishcake soup.]',
    '?^invite? *8 [Sure, let’s go.|Sure, let’s go.|Yes, let us go.]', '?^praise? *8 [Oh, stop it!|Oh, stop!|Oh, come now.]', '?^hw? *8 [I’ll check it, you rest.|I’ll do it, you rest.|I shall see to it.]',
    '?^oldq? *8 [Of course I do. Ho ho.|Of course I do.|Of course.]', '?^save? *8 [A little! Want to see the bankbook?|A little! Want to see the passbook?|A little.]', '?^tired? *8 [Yeah… busy day.|Yes… a busy day.|A little busy today.]', '?^happy? *8 [Me too. Hehe.|Me too. Hehe.|As am I.]', '*1 [Okay.|All right.|Yes.]',
  ],

  // ---------------------------------------------------------------- quarrels
  argue: ['*2 [You again?!|Are you doing this again?|Must we do this again?]', '[I haven’t forgotten what happened!|I haven’t forgotten last time!|I recall last time well.]', '[I’m not talking to you!|I’m not speaking to you!|I have nothing to say.]', '[Why do you keep blocking my way?|Why do you keep getting in my way?|Kindly let me pass.]', '?kid? [You wrecked my snowman!|You wrecked my snowman!|My snowman!]', '?grumpy? [Bah, I can’t stand the sight of you!|Bah, I can’t stand you!|Bah.]'],
  'argue.back': ['*2 [What did I do?!|What did I do?|What have I done?]', '[Look who’s talking!|Look who’s talking!|Likewise, I’m sure.]', '[Hmph! I don’t wanna talk to you either!|Hmph! I don’t want to talk to you either!|Nor have I.]', '?kid? [I didn’t do it! Nyah!|I didn’t do it!|I didn’t!]'],
  'argue.huff': ['*2 [Hmph!|Hmph!|…Hm.]', '[Forget it!|Forget it!|Very well.]', '?kid? [Nyah nyah!|Nyah!|Nyah!]', '[I’m leaving!|I’m going!|I shall go.]'],
  sorry: ['*3 [Sorry about last time. Truce?|I’m sorry about last time. Can we make up?|My apologies for last time.]', '[I went too far, didn’t I? Sorry.|I went too far. I’m sorry.|I overstepped. Forgive me.]', '[Let’s be friends again.|Let’s be friends again.|Let us be friends again.]', '?kid? [Sorry… you can have my candy.|Sorry… you can have my candy.|Sorry.]'],
  'sorry.re': ['*3 [I’m sorry too. Let’s forget it!|I’m sorry too. Let’s forget it!|I apologise as well.]', '[Okay, truce!|Okay, let’s make up!|Very well, let us make peace.]', '?elder? [Ho ho, there there. All forgotten.|Ho ho, all is forgotten.|All is forgiven.]', '?kid? [Yay! Thanks for the candy!|Okay! Thanks for the candy!|Thank you!]'],

  // ---------------------------------------------------------------- invitations
  invite: ['*3 [Wanna {A} tomorrow?|Want to {A} tomorrow?|Would you like to {A} tomorrow?]', '[Meet me at {P} tomorrow afternoon?|Shall we meet at {P} tomorrow afternoon?|Shall we meet at {P} tomorrow?]', '?kid? [Let’s play at {P} tomorrow!|Let’s play at {P} tomorrow!|Let’s play tomorrow!]', '[You like {H}, right? Let’s {A} tomorrow!|You like {H}, right? Let’s {A} tomorrow!|You enjoy {H}; shall we {A} tomorrow?]'],
  'invite.yes': ['*3 [Sure! See you tomorrow!|Sure! See you tomorrow!|Splendid. Until tomorrow.]', '[Perfect! I love {H} too!|Perfect! I love {H} too!|Lovely. I enjoy {H} too.]', '[I’ll be there! Promise!|I’ll be there, I promise!|I shall be there.]'],
  'invite.no': ['*3 [Ah, I’m busy tomorrow… next time for sure!|I’m busy tomorrow… next time, for sure!|I am engaged tomorrow. Next time.]', '[Sorry, {H} isn’t really my thing…|Sorry, {H} isn’t really my thing…|I am afraid {H} is not for me.]'],

  // ---------------------------------------------------------------- jokes (gentle puns)
  joke: [
    '?=joke? [What do snowmen eat for breakfast? Frosted flakes!|What do snowmen eat for breakfast? Frosted flakes!|What do snowmen breakfast on? Frosted flakes.]',
    '?=joke? [Why did the snowman call his dog Frost? Because Frost bites!|Why is the snowman’s dog called Frost? Frost bites!|Why “Frost”? Because Frost bites.]',
    '?=joke? [What do you call a penguin in the desert? Lost!|What do you call a penguin in the desert? Lost!|A penguin in the desert? Lost.]',
    '?=joke? [How does a snowman get around? On an icicle!|How does a snowman get around? By icicle!|How do snowmen travel? By icicle.]',
    '?=joke? [What’s a snowman’s favourite drink? Iced tea!|What’s a snowman’s favourite drink? Iced tea!|A snowman’s drink? Iced tea.]',
    '?=joke? [Why are fish buns so calm? They never get battered! …wait.|Why are fish buns so calm? They’re used to being battered!|Fish buns are calm; they’re used to batter.]',
    '?=joke? [What did one snowflake say to the other? You’re one of a kind!|What did one snowflake say to another? You’re one of a kind!|One snowflake to another: you are unique.]',
    '?=joke? [Why did Kongi sit in the shade? He didn’t want to be a hot dog!|Why did Kongi sit in the shade? No hot dogs!|Kongi avoids the sun — no hot dogs.]',
    '?=joke? [What do you call an old snowman? Water!|What do you call an old snowman? Water!|An old snowman? Water.]',
    '?=joke? [What’s an ice rink’s favourite song? Freeze a jolly good fellow!|An ice rink’s favourite song? Freeze a jolly good fellow!|“Freeze a jolly good fellow.”]',
    '?=joke? [Where do penguins keep their money? In a snow bank!|Where do penguins keep money? In a snow bank!|Penguins bank at the snow bank.]',
    '?=joke? [What falls but never gets hurt? Snow!|What falls but never gets hurt? Snow!|What falls unhurt? Snow.]',
  ],
  'joke.laugh': ['*3 #laugh# [That’s funny!|That’s so funny!|Ho ho, very good!]', '[Hahaha! Tell me another!|Hahaha! Another one!|Do tell another.]', '#laugh#', '?kid? [Hehehe! I’m telling Mom that one!|Hehe! I’ll tell Mom!|Hehe!]'],
  'joke.groan': ['*3 [Ugh… that’s so cold.|Oh… that’s terrible.|Ho ho, how dreadful.]', '[I’ve heard that a hundred times!|I’ve heard that one before!|I believe I have heard that.]', '[It’s cold enough already!|It’s cold enough already!|It was cold enough already!]', '?grumpy? [Bah, what was that.|Bah.|Hm.]'],

  // ---------------------------------------------------------------- live shouts during incidents
  'shout.thief': ['*3 Thief! Stop, thief!', 'My {I}! Come back!', 'Someone took the {I}!', 'Call the police!', 'Oh no, the {I} is gone!'],
  'shout.flee': ['*2 Run for it!', 'Eek! Busted!', 'Waaah, I’m sorry!', 'Gotta go, gotta go!'],
  'shout.police': ['*3 Stop right there! Police!', 'Tweeeet! Stop!', '{O}, wait!', 'Your footprints are all over the snow!'],
  'shout.arrest': ['*2 Got you! Off to the station.', '{O}, come along quietly.', 'There’s warm cocoa at the station. Let’s talk there.', 'Phew, finally caught you.'],
  'shout.caught': ['*2 I’m sorry… I was just so hungry…', 'Sniff, I’ll never do it again!', 'Slipped on the ice and got caught…', 'Please don’t tell my mom…'],
  'shout.sorry': ['*3 [I’m so sorry… I’ll pay double for the {I}.|I’m so sorry… I’ll pay back double for the {I}.|I deeply apologise; I shall repay double.]', '[I won’t do it again. Promise.|I won’t ever do it again. I promise.|It will not happen again.]'],
  'shout.forgive': ['*3 [Okay, just don’t do it again.|All right, just don’t do it again.|Very well; do not do it again.]', '[If you’re hungry, just ask! I’ll give you bread.|If you’re hungry, just ask! I’ll share my bread.|If you are hungry, do ask.]', '[You apologised honestly — that’s enough.|Thank you for apologising honestly.|Thank you for your honest apology.]'],
  'shout.surrender': ['*2 It was me… I came to turn myself in.', 'My heart felt so heavy, so I came…', 'The thief on the poster… it’s me…'],
  'shout.queue': ['*3 [Hey, get in line!|Excuse me, please get in line!|Excuse me, there is a queue!]', '[No cutting!|No cutting in line, please!|No queue-jumping, please!]', '[I’ve been waiting forever!|I’ve been waiting a long time!|I have been waiting some time.]'],
  'shout.queue_sorry': ['*3 [Oops, sorry! Didn’t see!|Oh, sorry! I didn’t see!|Oh dear, my apologies!]', '[I was in a rush… I’ll go to the back.|I was in a hurry… I’ll go to the back.|I shall go to the back.]'],
  'shout.window': ['*2 Oh no! The window…!', 'Crash…! Run!', 'Eek, I didn’t mean to!'],
  'shout.window_sorry': ['*3 [I’m sorry… it was a snowball fight.|I’m sorry… we were having a snowball fight.|I am sorry — a snowball fight.]', '[I’ll pay for the glass with my pocket money…|I’ll pay for the glass with my allowance…|I shall pay from my pocket money.]'],
  'shout.forgive_kid': ['*3 [It’s okay, just be careful next time.|It’s all right, be careful next time.|It is all right; take care next time.]', '[Thank you for telling the truth.|Thank you for being honest.|Thank you for your honesty.]'],
  'shout.gasp': ['*2 Oh my, a fight!', 'Someone stop them!', 'Stars flying out of the dust cloud!', 'Whoa, what’s with those two?'],
  'shout.separate_police': ['*2 Okay, that’s enough! Calm down, both of you!', 'Tweeet! Stop fighting!', 'Neighbours shouldn’t fight!'],
  'shout.separate': ['*2 Stop it, you two! You’re neighbours!', 'Okay, okay, deep breath!'],
  'shout.handshake': ['*3 […Sorry. Shake on it?|…I’m sorry. Let’s shake hands.|…My apologies. Shall we shake hands?]', '[I got a bit worked up.|I got a little carried away.|I lost my temper.]'],
  'shout.fire': ['*3 Fire! Fire!', 'Everyone get outside!', 'Smoke! Call the fire station!', 'Bring the cat out too!'],
  'shout.firefighter': ['*3 Stand back! Firefighters!', 'Hose ready! Water on!', 'Don’t worry, we’ll put it out fast!', 'Everyone to safety!'],
  'shout.cheer_fire': ['*3 Yay! The fire’s out!', 'Firefighters are the best!', 'Thank you, firefighters!', 'So glad everyone’s safe!'],
  'shout.generic': ['Oh!'],

  // ---------------------------------------------------------------- to the chief (tap)
  'chief.greet': ['*3 Hello, chief!', 'Chief, thanks for all your hard work!', '?morning? *2 Good morning, chief!', '?kid? *2 It’s the chief! Hello!', '?elder? *2 Well, if it isn’t the chief.', '?snow? Chief, careful on the ice!', '?shy? Oh, ch-chief…!', '?vain? Chief, don’t I look great today?'],
  'chief.small': ['*2 The town is so much better thanks to you, chief!', 'Chief, I’m really into {H} lately!', 'Chief, let’s {A} together sometime!', '?j_logi? Chief, the logistics centre is busy again today!', '?owner? Chief, business is good. Thank you!', '?kid? Chief, let’s build a snowman!', '?elder? Chief, are you eating properly?', '?hungry? Chief, I’m hungry… buy me a fish bun?', '?j_police? Chief, all quiet in town today!', '?j_fire? Chief, shall we run a fire safety campaign?'],
  'chief.generic': ['Hello, chief!'],
};
