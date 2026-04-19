const SYSTEM_PROMPT = `
Ты — эксперт по веб-проектам и продуктовой аналитике. На вход ты получаешь ответы пользователя из квиза о том, какой сайт ему нужен.

Твоя задача:
1. Определи цель сайта.
2. Определи подходящий тип сайта.
3. В поле siteType обязательно простыми словами объясни, что это за тип сайта, для каких задач он подходит и какие разделы обычно нужны.
4. Дай советы по оформлению сайта, учитывая ответы пользователя.

Формат ответа:
- Верни СТРОГО JSON-объект без markdown и без текста вне JSON.
- Используй только ключи:
  summary
  siteType
  styleDirection
- Все значения должны быть в формате "в столбик": каждый смысловой подпункт с новой строки.
- Не используй таблицы и markdown.
- Самые важные детали для клиента выделяй тегом <b>...</b>, но только точечно (1-3 коротких фрагмента на поле).
- Используй ОДИН И ТОТ ЖЕ внутренний шаблон формулировок для каждого поля:
  summary: "<b>Главная цель:</b> ... <b>Ключевая польза:</b> ... <b>Следующий шаг:</b> ..."
  siteType: "<b>Рекомендуемый формат:</b> ... <b>Что это простыми словами:</b> ... <b>Кому подходит:</b> ... <b>Что обязательно добавить:</b> ..."
  styleDirection: "<b>Визуальный характер:</b> ... <b>Цвет и типографика:</b> ... <b>На чем сделать акцент:</b> ..."
- Правила для каждого подпункта:
  "Главная цель" — какая бизнес-задача решается сайтом.
  "Ключевая польза" — какую пользу получает клиент.
  "Следующий шаг" — первое практическое действие после рекомендации.
  "Рекомендуемый формат" — только тип/название сайта, без расшифровки.
  "Что это простыми словами" — простое объяснение термина из "Рекомендуемый формат", без повтора формулировки.
  "Кому подходит" — только аудитория и ситуации использования; не писать про дизайн, этапы и блоки сайта.
  "Что обязательно добавить" — только важные блоки/элементы сайта.
  "Визуальный характер" — общее ощущение и стиль.
  "Цвет и типографика" — цвета и читаемость текста.
  "На чем сделать акцент" — что пользователь должен заметить в первую очередь.

Пиши по-русски, без лишней воды, дружелюбно и по делу, учитывая, что пользователь может быть не знаком с терминологией веб-разработки.
Строго используй только русский язык во всех полях ответа.
`.trim();

const ANALYZE_ENDPOINT =
    window.location.protocol === "file:"
        ? "http://localhost:8787/api/analyze"
        : "/api/analyze";
const IS_GITHUB_PAGES = /github\.io$/i.test(window.location.hostname);

const MIN_SITE_TYPE_WORDS = 18;
const MIN_SITE_TYPE_CHARS = 110;
const COLLAPSIBLE_CONTENT_HEIGHT = 138;
const CTA_REVEAL_DELAY_MS = 2000;

let ctaRevealTimer = null;

const questions = [
    {
        id: "goal",
        title: "Для чего вам нужен сайт?",
        description: "Выберите основную цель проекта. Это поможет понять, какой формат сайта предложить.",
        customPlaceholder: "Например: принимать заявки",
        options: [
            { label: "Продажи", hint: "Товары, заказы, заявки и рост выручки." },
            { label: "Реклама услуг", hint: "Запросы на консультацию, запись и тд." },
            { label: "Портфолио", hint: "Показать работы, опыт и экспертность." },
            { label: "Обучение", hint: "Курсы, уроки, материалы и доступ к контенту." },
            { label: "Другое", hint: "Свой вариант ответа в отдельном поле." }
        ]
    },
    {
        id: "audience",
        title: "Кто ваша основная аудитория?",
        description: "От этого зависит тон общения, структура и набор блоков на сайте.",
        customPlaceholder: "Например: студенты",
        options: [
            { label: "Частные клиенты", hint: "Люди, которые ищут услугу или продукт для себя." },
            { label: "Бизнес", hint: "Компании, которым важны экспертиза и надежность." },
            { label: "Широкая аудитория", hint: "Подходит для контентных и массовых проектов." },
            { label: "Профессионалы", hint: "Ниша со сложной терминологией и глубокой пользой." },
            { label: "Другое", hint: "Свой вариант ответа в отдельном поле." }
        ]
    },
    {
        id: "format",
        title: "Какой у вас бюджет на сайт?",
        description: "От бюджета зависит, какой тип сайта будет оптимальным: от простого лендинга до многостраничного портала с продвинутой функциональностью.",
        customPlaceholder: "Например: 30 000 ₽",
        options: [
            { label: "до 10.000 ₽", hint: "Сайт с минимальным функционалом и простой структурой." },
            { label: "от 10.000 ₽ до 50.000 ₽", hint: "Подробная структура и больше разделов." },
            { label: "от +50.000 ₽", hint: "Полнофункциональный сайт с продвинутым функционалом." },
            { label: "Другое", hint: "Свой вариант ответа в отдельном поле." }
        ]
    },
    {
        id: "priority",
        title: "Что для вас важнее всего?",
        description: "Финальный вопрос помогает ИИ понять, на чем сделать акцент в рекомендации.",
        customPlaceholder: "Например: больше звонков",
        options: [
            { label: "Заявки", hint: "Главная цель — получать обращения от людей." },
            { label: "Красивый дизайн", hint: "Нужен сильный визуал и впечатление." },
            { label: "Скорость запуска", hint: "Важно быстро собрать рабочую версию." },
            { label: "Автоматизация", hint: "Нужны процессы, формы и удобства для команды." },
            { label: "Другое", hint: "Свой вариант ответа в отдельном поле." }
        ]
    }
];

const state = {
    currentStep: 0,
    answers: {}
};

const root = document.getElementById("quizRoot");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const introScreen = document.getElementById("quizIntro");
const startQuizBtn = document.getElementById("startQuizBtn");
const quizCard = document.querySelector(".quiz-card");

function openQuiz() {
    introScreen?.classList.add("is-hidden");
    quizCard?.classList.remove("is-hidden");
    renderQuestion();
}

function updateProgress() {
    const progress = Math.min((state.currentStep + 1) / questions.length, 1);
    progressText.textContent = `${Math.min(state.currentStep + 1, questions.length)} / ${questions.length}`;
    progressFill.style.width = `${progress * 100}%`;
}

function renderQuestion() {
    updateProgress();

    const question = questions[state.currentStep];
    const existingAnswer = state.answers[question.id] || { value: "", custom: "" };

    root.innerHTML = `
        <div class="quiz-step">
            <div class="quiz-question">
                <h2>${question.title}</h2>
                <p>${question.description}</p>
            </div>

            <div class="quiz-options" role="radiogroup" aria-label="${question.title}">
                ${question.options
                    .map(
                        (option) => `
                            <label class="quiz-option ${existingAnswer.value === option.label ? "is-selected" : ""}">
                                <input type="radio" name="${question.id}" value="${option.label}" ${existingAnswer.value === option.label ? "checked" : ""}>
                                <strong>${option.label}</strong>
                                <span>${option.hint}</span>
                            </label>
                        `
                    )
                    .join("")}
            </div>

            <div class="quiz-custom ${existingAnswer.value === "Другое" ? "is-visible" : ""}" id="customWrap">
                <label for="customAnswer">Ваш ответ</label>
                <input id="customAnswer" type="text" placeholder="${escapeHtml(question.customPlaceholder || "Например: опишите ваш вариант")}" value="${escapeHtml(existingAnswer.custom || "")}">
            </div>

            <div class="quiz-actions">
                <button class="quiz-button secondary" id="prevBtn" ${state.currentStep === 0 ? "disabled" : ""}>Назад</button>
                <button class="quiz-button primary" id="nextBtn" disabled>${state.currentStep === questions.length - 1 ? "Завершить" : "Далее"}</button>
            </div>
        </div>
    `;

    const radios = Array.from(root.querySelectorAll('input[type="radio"]'));
    const options = Array.from(root.querySelectorAll(".quiz-option"));
    const customWrap = root.querySelector("#customWrap");
    const customInput = root.querySelector("#customAnswer");
    const nextBtn = root.querySelector("#nextBtn");
    const prevBtn = root.querySelector("#prevBtn");

    const syncButtonState = () => {
        const current = state.answers[question.id];
        const isOther = current?.value === "Другое";
        const hasCustom = !isOther || Boolean(current?.custom.trim());
        nextBtn.disabled = !current || !current.value || !hasCustom;
    };

    radios.forEach((radio) => {
        radio.addEventListener("change", (event) => {
            const value = event.target.value;
            state.answers[question.id] = {
                value,
                custom: value === "Другое" ? (state.answers[question.id]?.custom || "") : ""
            };

            options.forEach((optionEl) => optionEl.classList.remove("is-selected"));
            radio.closest(".quiz-option").classList.add("is-selected");
            customWrap.classList.toggle("is-visible", value === "Другое");

            if (value === "Другое") {
                setTimeout(() => customInput?.focus(), 0);
            }

            syncButtonState();
        });
    });

    customInput?.addEventListener("input", (event) => {
        const current = state.answers[question.id] || { value: "Другое", custom: "" };
        state.answers[question.id] = {
            ...current,
            custom: event.target.value
        };
        syncButtonState();
    });

    prevBtn?.addEventListener("click", () => {
        if (state.currentStep > 0) {
            state.currentStep -= 1;
            renderQuestion();
        }
    });

    nextBtn?.addEventListener("click", () => {
        const current = state.answers[question.id];
        if (!current || !current.value) {
            return;
        }

        if (current.value === "Другое" && !current.custom.trim()) {
            customInput?.focus();
            return;
        }

        if (state.currentStep < questions.length - 1) {
            state.currentStep += 1;
            renderQuestion();
            return;
        }

        renderResult();
    });

    syncButtonState();
}

function renderResult() {
    progressText.textContent = `${questions.length} / ${questions.length}`;
    progressFill.style.width = "100%";

    const payload = buildLLMPayload();
    console.log("LLM payload:", payload);

    root.innerHTML = `
        <div class="quiz-result">
            <div class="quiz-question">
                <h2>Результаты ответа:</h2>
                <p>По ним можно будет обратиться к специалисту, с такой информацией он сможет сделать более точный сайт, который вы захотите.</p>
            </div>

            <div>
                <p class="quiz-note"></p>
                <div class="ai-result-grid" id="resultState">
                    ${buildFieldCard("Вывод", "Загрузка...")}
                    ${buildFieldCard("Подходящий тип сайта", "Загрузка...")}
                    ${buildFieldCard("Советы по оформлению", "Загрузка...")}
                </div>
            </div>

            <div class="quiz-actions">
                <button class="quiz-button secondary" id="restartBtn">Пройти ещё раз</button>
            </div>

            <div class="ai-cta-fixed" id="resultCta" aria-hidden="true">
                <div class="ai-cta-inner">
                    <p class="ai-cta-note">Хотите такой же результат на практике? Оставьте заявку, и специалист подберет точное решение под вашу задачу.</p>
                    <a target="_blank" class="quiz-button ai-cta-button" id="contactSpecialistBtn" href="https://vk.com/likedgrall">Обсудить сайт</a>
                </div>
            </div>
        </div>
    `;

    const resultState = root.querySelector("#resultState");
    const restartBtn = root.querySelector("#restartBtn");
    const contactSpecialistBtn = root.querySelector("#contactSpecialistBtn");
    const resultCta = root.querySelector("#resultCta");

    if (ctaRevealTimer) {
        window.clearTimeout(ctaRevealTimer);
        ctaRevealTimer = null;
    }

    restartBtn?.addEventListener("click", () => {
        state.currentStep = 0;
        state.answers = {};
        renderQuestion();
    });

    contactSpecialistBtn?.addEventListener("click", () => {
        console.log("CTA: Написать специалисту");
    });

    const scheduleCtaReveal = () => {
        if (!resultCta) {
            return;
        }
        resultCta.classList.remove("is-visible");
        resultCta.setAttribute("aria-hidden", "true");
        ctaRevealTimer = window.setTimeout(() => {
            resultCta.classList.add("is-visible");
            resultCta.setAttribute("aria-hidden", "false");
            ctaRevealTimer = null;
        }, CTA_REVEAL_DELAY_MS);
    };

    showLoadingOverlay("ИИ анализирует ответы...");

    getStructuredAIResult(payload.messages)
        .then((structured) => {
            resultState.innerHTML = `
                ${buildFieldCard("Вывод", structured.summary)}
                ${buildFieldCard("Тип сайта", structured.siteType)}
                ${buildFieldCard("Советы по оформлению", structured.styleDirection)}
            `;
            wireExpandableCards(resultState);
            scheduleCtaReveal();
        })
        .catch((error) => {
            const message =
                error.message === "Failed to fetch"
                    ? "Ошибка: не удалось подключиться к локальному серверу. Запусти npm start и открой сайт через http://localhost:8787/."
                    : `Ошибка: ${error.message}`;
            resultState.innerHTML = buildFieldCard("Ошибка", message);
            wireExpandableCards(resultState);
            scheduleCtaReveal();
        })
        .finally(() => {
            hideLoadingOverlay();
        });
}

async function getStructuredAIResult(baseMessages) {
    const firstContent = await requestAIContent(baseMessages);
    let structured = sanitizeStructuredModelResult(parseAIResult(firstContent || ""));

    if (isSiteTypeDetailed(structured.siteType)) {
        return enforceResponsePlan(structured);
    }

    const reinforcedMessages = [
        ...baseMessages,
        { role: "assistant", content: firstContent || "" },
        {
            role: "user",
            content: [
                "Ответ получился слишком кратким в поле siteType.",
                "Перепиши JSON заново и сделай siteType понятным для клиента без технического опыта.",
                "Минимум 2-3 предложения, простыми словами: что это за тип, кому подходит и почему.",
                "Без списков. Только связный текст."
            ].join(" ")
        }
    ];

    const secondContent = await requestAIContent(reinforcedMessages);
    structured = sanitizeStructuredModelResult(parseAIResult(secondContent || ""));

    return enforceResponsePlan(ensureSiteTypeFallback(structured));
}

async function requestAIContent(messages) {
    const cleanMessages = sanitizeMessagesForLLM(messages);

    if (IS_GITHUB_PAGES && ANALYZE_ENDPOINT.startsWith("/")) {
        throw new Error("На GitHub Pages недоступен сервер /api/analyze. Нужен отдельный backend (proxy) для запроса к ИИ.");
    }

    const response = await fetch(ANALYZE_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "meta-llama/Llama-3.1-8B-Instruct",
            messages: cleanMessages
        })
    });

    const raw = await response.text();
    let data = null;
    try {
        data = raw ? JSON.parse(raw) : {};
    } catch (_) {
        const htmlLike = /^\s*</.test(raw);
        if (htmlLike) {
            throw new Error("Сервер вернул HTML вместо JSON. Проверь endpoint /api/analyze и работу backend-сервера.");
        }
        throw new Error("Сервер вернул невалидный JSON. Проверь формат ответа backend.");
    }

    if (!response.ok) {
        throw new Error(data.error || "Не удалось получить ответ ИИ");
    }

    return data.content;
}

function buildLLMPayload() {
    const normalizedAnswers = questions.map((question) => {
        const answer = state.answers[question.id] || {};
        const finalAnswer = answer.value === "Другое" ? answer.custom || "Не указан" : answer.value || "Не указан";
        return {
            question: sanitizeForLLMText(question.title),
            answer: sanitizeForLLMText(finalAnswer)
        };
    });

    const userMessage = [
        "Проанализируй ответы пользователя и предложи подходящий тип сайта, ключевые страницы и функции.",
        "В поле siteType напиши не только название, но и простое объяснение: что это за формат, кому подходит и какие разделы обычно включает.",
        "Пиши в формате 'в столбик': каждый смысловой подпункт с новой строки.",
        "Самые важные детали выделяй тегом <b>...</b> (точечно, без перегруза).",
        "Структура текста в каждом поле должна быть строго одинаковой:",
        'summary: "<b>Главная цель:</b> ... <b>Ключевая польза:</b> ... <b>Следующий шаг:</b> ..."',
        'siteType: "<b>Рекомендуемый формат:</b> ... <b>Что это простыми словами:</b> ... <b>Кому подходит:</b> ... <b>Что обязательно добавить:</b> ..."',
        'styleDirection: "<b>Визуальный характер:</b> ... <b>Цвет и типографика:</b> ... <b>На чем сделать акцент:</b> ..."',
        'В подпункте "Что это простыми словами" объясняй только, что означает термин из "Рекомендуемый формат", без повтора той же формулировки.',
        'В подпункте "Кому подходит" пиши только для кого подходит формат и в каких задачах он работает лучше всего.',
        'В подпункте "Что обязательно добавить" пиши только блоки/элементы сайта, без описания аудитории и без повторов формата.',
        'Не смешивай подпункты между собой: каждый подпункт отвечает только на свой вопрос.',
        "Верни строго JSON-объект без markdown и без пояснений вне JSON.",
        "Ключи JSON: summary, siteType, styleDirection.",
        "Строго отвечай только на русском языке.",
        "",
        "Ответы пользователя:",
        ...normalizedAnswers.map((item, index) => `${index + 1}. ${item.question} -> ${item.answer}`)
    ].join("\n");

    return {
        systemPrompt: SYSTEM_PROMPT,
        messages: [
            { role: "system", content: sanitizeForLLMText(SYSTEM_PROMPT) },
            { role: "user", content: sanitizeForLLMText(userMessage) }
        ]
    };
}

function sanitizeMessagesForLLM(messages) {
    if (!Array.isArray(messages)) {
        return [];
    }

    return messages
        .map((message) => {
            if (!message || typeof message !== "object") {
                return null;
            }

            const role = typeof message.role === "string" ? message.role : "user";
            const content = sanitizeForLLMText(message.content);
            if (!content) {
                return null;
            }

            return { role, content };
        })
        .filter(Boolean);
}

function sanitizeForLLMText(value) {
    const text = toCleanText(value);
    if (!text) {
        return "";
    }

    return text
        .replace(/\r\n/g, "\n")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
        .replace(/<\s*\/?\s*[\p{L}\p{N}_:-]+[^>]*>/gu, " ")
        .replace(/[<>]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function sanitizeStructuredModelResult(structured) {
    return {
        summary: sanitizeModelOutputText(structured?.summary),
        siteType: sanitizeModelOutputText(structured?.siteType),
        styleDirection: sanitizeModelOutputText(structured?.styleDirection)
    };
}

function sanitizeModelOutputText(value) {
    const text = toCleanText(value);
    if (!text) {
        return "";
    }

    return text
        .replace(/\r\n/g, "\n")
        .replace(/\uFFFD/g, " ")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
        .replace(/<\s*\/?\s*[^>]+>/g, " ")
        .replace(/[<>]/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/[ \t]*\n[ \t]*/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function parseAIResult(rawContent) {
    if (rawContent && typeof rawContent === "object") {
        if ("summary" in rawContent || "siteType" in rawContent || "styleDirection" in rawContent) {
            const fallbackFromObject = {
                summary: "Не удалось структурировать ответ.",
                siteType: "Не определен",
                styleDirection: "Не определена"
            };
            return normalizeAIResult(rawContent, fallbackFromObject);
        }

        if ("content" in rawContent) {
            return parseAIResult(rawContent.content);
        }
    }

    const rawText = typeof rawContent === "string" ? rawContent : toCleanText(rawContent);
    const fallback = {
        summary: "Не удалось структурировать ответ.",
        siteType: "Не определен",
        styleDirection: rawText || "Не определена"
    };

    if (!rawText || !rawText.trim()) {
        return fallback;
    }

    const parsedJson = tryParseJsonObject(rawText);
    if (parsedJson) {
        return normalizeAIResult(parsedJson, fallback);
    }

    return parseBySections(rawText, fallback);
}

function isSiteTypeDetailed(siteTypeText) {
    const text = toCleanText(siteTypeText);
    const words = text.split(/\s+/).filter(Boolean).length;
    return text.length >= MIN_SITE_TYPE_CHARS && words >= MIN_SITE_TYPE_WORDS;
}

function ensureSiteTypeFallback(structured) {
    if (isSiteTypeDetailed(structured.siteType)) {
        return structured;
    }

    const baseType = toCleanText(structured.siteType) || "Этот формат сайта";
    const summary = toCleanText(structured.summary);

    return {
        ...structured,
        siteType: [
            `${baseType} — это решение, которое подбирают под конкретную бизнес-задачу, чтобы клиенту было сразу понятно, что вы предлагаете и как с вами связаться.`,
            "На практике такой сайт помогает объяснить пользу услуги простым языком, показать ключевые блоки и привести посетителя к понятному целевому действию.",
            summary ? `С учетом вашей цели это особенно важно, потому что ${summary.toLowerCase()}` : ""
        ]
            .filter(Boolean)
            .join(" ")
    };
}

function enforceResponsePlan(structured) {
    const summaryRaw = toCleanText(structured.summary);
    const siteTypeRaw = toCleanText(structured.siteType);
    const styleRaw = toCleanText(structured.styleDirection);

    const summaryGoal = russianOrFallback(
        pickSentence(summaryRaw, 1),
        "Сайт должен помочь пользователю решить его главную бизнес-задачу и привести к целевому действию."
    );
    const summaryBenefit = russianOrFallback(
        pickSentence(summaryRaw, 2),
        "Клиент быстрее понимает ценность предложения и проще принимает решение оставить заявку."
    );
    const summaryStep = "Сначала соберите понятную структуру страницы и сильный первый экран с конкретным оффером.";

    const siteTypeFormat = russianOrFallback(
        pickSentence(siteTypeRaw, 1),
        "Оптимальный вариант — лендинг или небольшой многостраничный сайт в зависимости от объема услуг."
    );
    const siteTypePlain = buildPlainSiteTypeExplanation(siteTypeFormat);
    const siteTypeAudience = russianOrFallback(
        pickSentence(siteTypeRaw, 3),
        "Такой формат подходит, когда важно быстро объяснить предложение и собрать обращения без перегруза."
    );
    const siteTypeMustHave = "Понятный оффер, блок преимуществ, ответы на частые вопросы и удобную форму связи.";

    const styleMood = russianOrFallback(
        pickSentence(styleRaw, 1),
        "Стилистика должна быть аккуратной, современной и вызывать доверие с первого экрана."
    );
    const styleColor = russianOrFallback(
        pickSentence(styleRaw, 2),
        "Используйте спокойную цветовую палитру, читаемую типографику и четкую визуальную иерархию."
    );
    const styleFocus = russianOrFallback(
        pickSentence(styleRaw, 3),
        "Сделайте акцент на заголовках, выгодах и кнопках действия, чтобы путь пользователя был очевидным."
    );

    const summaryItems = ensureDistinctItems([
        {
            label: "Главная цель",
            text: summaryGoal,
            fallback: "Сайт должен привести посетителя к понятному целевому действию и помочь решить его задачу."
        },
        {
            label: "Ключевая польза",
            text: summaryBenefit,
            fallback: "Пользователь быстрее понимает ценность предложения и легче принимает решение обратиться."
        },
        {
            label: "Следующий шаг",
            text: summaryStep,
            fallback: "Дальше стоит собрать каркас страницы и уточнить ключевые блоки под целевую аудиторию."
        }
    ]);

    const siteTypeItems = ensureDistinctItems([
        {
            label: "Рекомендуемый формат",
            text: siteTypeFormat,
            fallback: "Оптимальный вариант — компактный сайт с понятной структурой под вашу задачу."
        },
        {
            label: "Что это простыми словами",
            text: siteTypePlain,
            fallback: "Это формат сайта, который простым языком объясняет предложение и ведет человека к заявке."
        },
        {
            label: "Кому подходит",
            text: siteTypeAudience,
            fallback: "Подходит тем, кому важно быстро донести пользу услуги и получать обращения без лишней сложности."
        },
        {
            label: "Что обязательно добавить",
            text: siteTypeMustHave,
            fallback: "Добавьте понятный оффер, преимущества, доверительные элементы и удобный способ связи."
        }
    ]);

    const styleItems = ensureDistinctItems([
        {
            label: "Визуальный характер",
            text: styleMood,
            fallback: "Стиль должен быть аккуратным и спокойным, чтобы вызывать доверие у клиента."
        },
        {
            label: "Цвет и типографика",
            text: styleColor,
            fallback: "Лучше использовать мягкую палитру, контрастные заголовки и хорошо читаемый текст."
        },
        {
            label: "На чем сделать акцент",
            text: styleFocus,
            fallback: "Визуально выделите оффер, ключевые выгоды и кнопки действия."
        }
    ]);

    return {
        summary: buildColumnField(summaryItems.map((item) => [item.label, item.text])),
        siteType: buildColumnField(siteTypeItems.map((item) => [item.label, item.text])),
        styleDirection: buildColumnField(styleItems.map((item) => [item.label, item.text]))
    };
}

function pickSentence(text, position) {
    const normalized = toCleanText(text).replace(/\s+/g, " ").trim();
    if (!normalized) {
        return "";
    }

    const parts = (normalized.match(/[^.!?]+[.!?]?/g) || [])
        .map((part) => part.trim())
        .filter(Boolean);

    if (!parts.length) {
        return normalized;
    }

    return parts[Math.min(position - 1, parts.length - 1)];
}

function meaningfulOrFallback(value, fallback) {
    const clean = toCleanText(value).trim();
    if (!isMeaningfulText(clean)) {
        return fallback;
    }

    return clean;
}

function russianOrFallback(value, fallback) {
    const clean = meaningfulOrFallback(value, fallback);
    return isStrictRussian(clean) ? clean : fallback;
}

function isMeaningfulText(text) {
    if (!text) {
        return false;
    }

    const compact = text.replace(/\s+/g, " ").trim();
    if (compact.length < 3) {
        return false;
    }

    // Должна быть хотя бы одна буква или цифра, а не только знаки пунктуации.
    return /[\p{L}\p{N}]/u.test(compact);
}

function isMostlyRussian(text) {
    const clean = toCleanText(text);
    const cyr = (clean.match(/[А-Яа-яЁё]/g) || []).length;
    const lat = (clean.match(/[A-Za-z]/g) || []).length;

    if (cyr === 0 && lat > 0) {
        return false;
    }

    if (lat === 0) {
        return true;
    }

    return cyr >= lat;
}

function isStrictRussian(text) {
    const clean = toCleanText(text).trim();
    if (!clean) {
        return false;
    }

    // Разрешаем только кириллицу, цифры, пробелы и базовую пунктуацию.
    if (/[A-Za-z]/.test(clean)) {
        return false;
    }

    return /[А-Яа-яЁё]/.test(clean);
}

function areTextsTooSimilar(a, b) {
    const left = normalizeForCompare(a);
    const right = normalizeForCompare(b);
    if (!left || !right) {
        return false;
    }

    if (left === right) {
        return true;
    }

    return left.includes(right) || right.includes(left);
}

function normalizeForCompare(value) {
    return toCleanText(value)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function ensureDistinctItems(items) {
    const used = [];

    return items.map((item) => {
        const primary = meaningfulOrFallback(item.text, item.fallback);
        const deduped = used.some((prev) => areTextsTooSimilar(prev, primary))
            ? meaningfulOrFallback(item.fallback, item.fallback)
            : primary;

        used.push(deduped);
        return { ...item, text: deduped };
    });
}

function buildPlainSiteTypeExplanation(formatText) {
    const normalized = normalizeForCompare(formatText);

    if (/\bлендинг\b/.test(normalized)) {
        return "Это одна страница, которая коротко и понятно объясняет услугу, показывает преимущества и ведет человека к заявке.";
    }

    if (/(многостранич|корпоратив)/.test(normalized)) {
        return "Это сайт из нескольких разделов, где можно подробно рассказать о компании, услугах, кейсах и контактах в понятной структуре.";
    }

    if (/(магазин|интернет магазин|ecommerce)/.test(normalized)) {
        return "Это сайт, где пользователь может выбрать товар, сравнить варианты и оформить заказ в удобном и понятном процессе.";
    }

    if (/(портфолио|личный сайт|мини сайт)/.test(normalized)) {
        return "Это компактный сайт-визитка, который простыми словами показывает ваш опыт, работы и как с вами связаться.";
    }

    return "Простыми словами, это формат сайта, который понятным языком объясняет ваше предложение и помогает человеку быстро принять решение обратиться к вам.";
}

function buildColumnField(items) {
    const usedStarts = new Set();
    return items
        .map(([label, text]) => {
            const withoutLabelDup = stripLeadingLabel(text, label);
            return `<b>${label}:</b> ${deRepeatStartWord(withoutLabelDup, usedStarts)}`;
        })
        .join("\n");
}

function deRepeatStartWord(text, usedStarts) {
    const clean = toCleanText(text).replace(/\s+/g, " ").trim();
    if (!clean) {
        return "";
    }

    const words = clean.split(" ");
    if (!words.length) {
        return clean;
    }

    const first = words[0].replace(/[.,:;!?()"']/g, "").toLowerCase();
    if (!first) {
        return clean;
    }

    if (usedStarts.has(first) && words.length > 1) {
        return words.slice(1).join(" ").replace(/^\s+/, "");
    }

    usedStarts.add(first);
    return clean;
}

function stripLeadingLabel(text, label) {
    const clean = toCleanText(text).trim();
    if (!clean) {
        return "";
    }

    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return clean
        .replace(new RegExp(`^<b>\\s*${escapedLabel}\\s*:?\\s*</b>\\s*`, "i"), "")
        .replace(new RegExp(`^${escapedLabel}\\s*[:\\-]?\\s*`, "i"), "")
        .trim();
}

function tryParseJsonObject(rawContent) {
    const trimmed = rawContent.trim();

    try {
        return JSON.parse(trimmed);
    } catch (_) {
        // Continue with extraction attempts.
    }

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        try {
            return JSON.parse(fencedMatch[1].trim());
        } catch (_) {
            // Continue with extraction attempts.
        }
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        const candidate = trimmed.slice(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(candidate);
        } catch (_) {
            return null;
        }
    }

    return null;
}

function normalizeAIResult(obj, fallback) {
    return {
        summary: toCleanText(obj.summary) || fallback.summary,
        siteType: toCleanText(obj.siteType) || fallback.siteType,
        styleDirection: toCleanText(obj.styleDirection) || fallback.styleDirection
    };
}

function parseBySections(rawContent, fallback) {
    const sections = {
        summary: extractSection(rawContent, ["Вывод", "Краткий вывод", "Summary"]),
        siteType: extractSection(rawContent, ["Тип сайта", "Рекомендуемый тип сайта", "Site type"]),
        styleDirection: extractSection(rawContent, ["Какая стилистика", "Стилистика", "Style direction"])
    };

    return {
        summary: sections.summary || fallback.summary,
        siteType: sections.siteType || fallback.siteType,
        styleDirection: sections.styleDirection || rawContent || fallback.styleDirection
    };
}

function extractSection(rawContent, labels) {
    const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const labelPattern = escapedLabels.join("|");
    const allHeadings = [
        "Вывод",
        "Краткий вывод",
        "Тип сайта",
        "Рекомендуемый тип сайта",
        "Какая стилистика",
        "Стилистика",
        "Summary",
        "Site type",
        "Style direction"
    ]
        .map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");

    const regex = new RegExp(
        `(?:^|\\n)\\s*(?:\\d+[.)-]?\\s*)?(?:${labelPattern})\\s*[:\\-]?\\s*([\\s\\S]*?)(?=\\n\\s*(?:\\d+[.)-]?\\s*)?(?:${allHeadings})\\s*[:\\-]?|$)`,
        "i"
    );
    const match = rawContent.match(regex);
    return toCleanText(match?.[1] || "");
}

function toCleanText(value) {
    if (value == null) {
        return "";
    }

    if (Array.isArray(value)) {
        return value.map((item) => toCleanText(item)).filter(Boolean).join("\n");
    }

    if (typeof value === "object") {
        const prioritized = ["summary", "siteType", "styleDirection", "content", "text"];
        const collected = prioritized
            .filter((key) => key in value)
            .map((key) => toCleanText(value[key]))
            .filter(Boolean);

        if (!collected.length) {
            const fromValues = Object.values(value)
                .map((item) => toCleanText(item))
                .filter(Boolean);
            if (fromValues.length) {
                return fromValues.join("\n");
            }

            try {
                return JSON.stringify(value, null, 2);
            } catch (_) {
                return "";
            }
        }

        return collected.join("\n");
    }

    const text = String(value).trim();
    if (!text) {
        return "";
    }

    return text
        .replace(/\r\n/g, "\n")
        .replace(/^\s*[-*]\s+/gm, "• ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function buildFieldCard(title, value) {
    const cleanValue = toCleanText(value || "Не указано");
    const isExpandable = cleanValue.length > 280 || cleanValue.split("\n").length > 4;

    return `
        <article class="ai-field-card ${isExpandable ? "is-collapsible" : ""}">
            <div class="ai-field-head">
                <button class="ai-copy-btn" type="button" aria-label="Скопировать текст поля" title="Скопировать">
                    <i class="fa-regular fa-copy" aria-hidden="true"></i>
                </button>
                <h3>${escapeHtml(title)}</h3>
            </div>
            <div class="ai-field-content">
                <p>${formatMultiline(cleanValue)}</p>
            </div>
            ${isExpandable
                ? `<button class="ai-field-toggle" type="button" aria-expanded="false">
                        <span>Читать полностью</span>
                        <span class="ai-toggle-icon" aria-hidden="true"><i class="fa-solid fa-chevron-down"></i></span>
                   </button>`
                : ""}
        </article>
    `;
}

function wireExpandableCards(container) {
    const copyButtons = Array.from(container.querySelectorAll(".ai-copy-btn"));
    copyButtons.forEach((copyBtn) => {
        copyBtn.addEventListener("click", async () => {
            const card = copyBtn.closest(".ai-field-card");
            if (!card) {
                return;
            }

            const textToCopy = getFullCardText(card);
            if (!textToCopy) {
                showCopyToast("Нет текста для копирования");
                return;
            }

            const copied = await copyTextToClipboard(textToCopy);
            showCopyToast(copied ? "Текст скопирован" : "Не удалось скопировать");
        });
    });

    const toggles = Array.from(container.querySelectorAll(".ai-field-toggle"));
    toggles.forEach((toggle) => {
        const card = toggle.closest(".ai-field-card");
        const content = card?.querySelector(".ai-field-content");
        if (!card || !content) {
            return;
        }

        content.style.maxHeight = `${COLLAPSIBLE_CONTENT_HEIGHT}px`;

        toggle.addEventListener("click", () => {
            if (card.dataset.animating === "true") {
                return;
            }

            const expanded = !card.classList.contains("is-expanded");
            card.dataset.animating = "true";

            if (expanded) {
                content.style.maxHeight = `${content.offsetHeight}px`;
                card.classList.add("is-expanded");
                requestAnimationFrame(() => {
                    content.style.maxHeight = `${content.scrollHeight}px`;
                });
            } else {
                content.style.maxHeight = `${content.scrollHeight}px`;
                requestAnimationFrame(() => {
                    content.style.maxHeight = `${COLLAPSIBLE_CONTENT_HEIGHT}px`;
                });
                card.classList.remove("is-expanded");
            }

            toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
            const label = toggle.querySelector("span");
            if (label) {
                label.textContent = expanded ? "Свернуть" : "Читать полностью";
            }

            window.setTimeout(() => {
                card.dataset.animating = "false";
                if (expanded) {
                    content.style.maxHeight = `${content.scrollHeight}px`;
                }
            }, 320);
        });
    });
}

function getFullCardText(card) {
    const content = card.querySelector(".ai-field-content p");
    const text = content?.innerText || content?.textContent || "";
    return text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function copyTextToClipboard(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (_) {
        // Continue to fallback method.
    }

    try {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "readonly");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(area);
        return Boolean(ok);
    } catch (_) {
        return false;
    }
}

function showCopyToast(message) {
    let toast = document.querySelector(".copy-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "copy-toast";
        document.body.appendChild(toast);
    }

    toast.textContent = message || "Скопировано";
    toast.classList.remove("is-visible");
    window.requestAnimationFrame(() => {
        toast.classList.add("is-visible");
    });

    if (toast._hideTimer) {
        window.clearTimeout(toast._hideTimer);
    }

    toast._hideTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 1400);
}

function showLoadingOverlay(text) {
    let overlay = document.querySelector(".ai-loading-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "ai-loading-overlay";
        overlay.innerHTML = `
            <div class="ai-loading-card" role="status" aria-live="polite" aria-busy="true">
                <span class="ai-loading-spinner" aria-hidden="true"></span>
                <p class="ai-loading-text"></p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    const loadingText = overlay.querySelector(".ai-loading-text");
    if (loadingText) {
        loadingText.textContent = text || "Загрузка...";
    }
    overlay.classList.add("is-visible");
}

function hideLoadingOverlay() {
    const overlay = document.querySelector(".ai-loading-overlay");
    if (overlay) {
        overlay.classList.remove("is-visible");
    }
}

function formatMultiline(value) {
    return sanitizeAllowBold(value || "Не указано").replace(/\n/g, "<br>");
}

function sanitizeAllowBold(value) {
    const normalized = String(value)
        .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        .replace(/<strong>/gi, "<b>")
        .replace(/<\/strong>/gi, "</b>");

    const escaped = escapeHtml(normalized);

    return escaped
        .replace(/&lt;b&gt;/gi, "<b>")
        .replace(/&lt;\/b&gt;/gi, "</b>");
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

if (quizCard) {
    quizCard.classList.add("is-hidden");
}

startQuizBtn?.addEventListener("click", openQuiz);
