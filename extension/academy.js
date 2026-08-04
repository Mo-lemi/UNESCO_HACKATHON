// Red Flag Academy: the MIL Education screen. Each lesson generalises one
// real deception pattern from features.py into a plain-language lesson,
// with a "Share this red flag" export that copies a plain-text card to the
// clipboard, works with no install, and no account (a youth organisation or
// school can forward it as-is).

const LESSONS = [
  {
    id: "upfront-payment",
    title: "Payment before interview",
    en: "A real employer never asks you to pay before you're hired. If a posting asks for a \"registration fee\", a \"starter pack\" fee, or a refundable deposit before an interview, that is not a real job. It's designed to take your money.",
    zu: "Umqashi weqiniso akaze akucele ukuthi ukhokhe ngaphambi kokuqashwa. Uma isikhangiso sicela \"imali yokubhalisa\", imali ye-\"starter pack\", noma isibambiso esingabuyiselwa ngaphambi kwenhlolokhono, lowo akulona ithuba eliqinisile. Kuhlose ukuthatha imali yakho.",
    xh: "Umqeshi wokwenene akaze akucele ukuba uhlawule phambi kokuba uqeshwe. Ukuba isaziso sicela \"imali yobhaliso\", imali ye-\"starter pack\", okanye idipozithi ebuyiselwayo phambi kodliwano-ndlebe, olo asilotuba lokwenene. Lwenzelwe ukuthatha imali yakho.",
    st: "Mohiri wa nnete ha a ke a o kopa hore o lefe pele o hirwa. Haeba tsebiso e kopa \"tefo ya ngodiso\", tefo ya \"starter pack\", kapa dipohliso e busetsoang pele ho inthavu, oo hase mosebetsi wa nnete. O etseditswe ho nka chelete ya hao.",
    af: "'n Regte werkgewer vra jou nooit om te betaal voordat jy aangestel is nie. As 'n advertensie 'n \"registrasiefooi\", 'n \"aanvangspak\"-fooi, of 'n terugbetaalbare deposito voor 'n onderhoud vra, is dit nie 'n regte werk nie. Dit is ontwerp om jou geld te vat.",
  },
  {
    id: "whatsapp-migration",
    title: "Moved off the platform to WhatsApp",
    en: "If a posting on a job site or Facebook pushes you to \"WhatsApp us\" instead of applying through the platform, be careful. Moving off an official channel makes the scammer harder to trace and makes it easier to pressure you.",
    zu: "Uma isikhangiso kusizindalwazi somsebenzi noma ku-Facebook sikucindezela ukuthi \"usithumele i-WhatsApp\" esikhundleni sokufaka isicelo ngesiteshi esisemthethweni, qaphela. Ukusuka endleleni esemthethweni kwenza kube nzima ukulandelela umenzi wobuqili futhi kulula ukukucindezela.",
    xh: "Ukuba isaziso kwiwebhusayithi yemisebenzi okanye kuFacebook sikutyhalela ekubeni \"usithumelele nge-WhatsApp\" endaweni yokufaka isicelo ngeqonga, lumka. Ukushiya ijelo elisemthethweni kwenza umqhathi abe nzima ukulandelelwa kwaye kube lula ukukucinezela.",
    st: "Haeba tsebiso e webosaeteng ya mesebetsi kapa Facebook e o sutumelletsa hore o \"re romelle WhatsApp\" ho e-na le ho etsa kopo ka sethala, hlokomela. Ho tswa mocheng o molaong ho etsa hore mokwatli a be thata ho lateloa mme ho be bonolo ho o hatella.",
    af: "As 'n advertensie op 'n werkswebwerf of Facebook jou aanmoedig om \"ons op WhatsApp te kontak\" pleks van deur die amptelike platform aansoek te doen, wees versigtig. Om van 'n amptelike kanaal weg te skuif maak die bedrieër moeiliker om op te spoor en makliker om jou onder druk te plaas.",
  },
  {
    id: "fake-popia",
    title: "A legal clause used to sound official",
    en: "Scammers quote POPIA (the Protection of Personal Information Act) to sound official while asking for your ID document. Real POPIA compliance protects your data. It's never the reason to demand an ID copy before you've even been shortlisted.",
    zu: "Abaqili bacaphuna i-POPIA ukuze bezwakale bengabomthetho ngenkathi becela idokhumenti yakho yesazisi. Ukuhambisana okuyikho ne-POPIA kuvikela idatha yakho. Akusetshenziswa njengesizathu sokucela ikhophi yesazisi ngaphambi kokuba ukhethwe ngisho nasohlwini.",
    xh: "Abaqhathi bacaphula i-POPIA ukuze bavakale besemthethweni ngelixa becela uxwebhu lwakho lwesazisi. Ukuthobela i-POPIA okwenyani kukhusela idatha yakho. Ayisosizathu sokufuna ikopi yesazisi phambi kokuba ukhethwe.",
    st: "Mekwatli e qotsa POPIA hore e utlwahale e le ya molao ha e ntse e kopa tokomane ya hao ya boitsebiso. Ho latela POPIA ha nnete ho sireletsa data ya hao. Ha se lebaka la ho batla kopi ya ID pele o kgethiloe.",
    af: "Bedrieërs haal POPIA aan om amptelik te klink terwyl hulle jou ID-dokument vra. Regte POPIA-nakoming beskerm jou data. Dit is nooit die rede om 'n ID-afskrif te eis voordat jy eers op 'n kortlys geplaas is nie.",
  },
  {
    id: "salary-mismatch",
    title: "A salary too good for the role",
    en: "A salary far above the normal range for a role with \"no experience needed\" is designed to make desperation override doubt. Check the real market rate before you get excited.",
    zu: "Iholo eliphezulu kakhulu kunobulili obuvamile besikhundla esithi \"akudingeki lwazi\" lakhelwe ukuthi ukuphelelwa yithemba kudlule ukungabaza. Hlola izinga lemakethe langempela ngaphambi kokujabula.",
    xh: "Umvuzo ongaphezulu kakhulu kunesiqhelo kwisikhundla esithi \"akukho mava afunekayo\" wenzelwe ukwenza ukuswela kudlule ukuthandabuza. Khangela ixabiso lokwenyani lemarike phambi kokuba uvuyiswe.",
    st: "Moputso o phahameng haholo ho feta o tlwaelehileng bakeng sa mosebetsi o reng \"ha ho phihlelo e hlokahalang\" o etseditswe hore bofuma bo hlole pelaelo. Hlahloba sekgahla sa nnete sa mmaraka pele o thabela.",
    af: "'n Salaris baie hoër as die normale reeks vir 'n pos wat \"geen ondervinding nodig nie\" aandui, is ontwerp om wanhoop jou twyfel te laat oorheers. Gaan die werklike markkoers na voordat jy opgewonde raak.",
  },
];

const LANG_LABEL = { en: "English", zu: "isiZulu", xh: "isiXhosa", st: "Sesotho", af: "Afrikaans" };

function render() {
  const root = document.getElementById("lessons");
  root.innerHTML = "";
  LESSONS.forEach((lesson) => {
    const el = document.createElement("div");
    el.className = "lesson";
    el.innerHTML = `
      <h3>${lesson.title}</h3>
      <p data-lang-text>${lesson.en}</p>
      <div class="lesson-actions">
        <select class="lang-select" data-lang-select>
          <option value="en">English</option>
          <option value="zu">isiZulu</option>
          <option value="xh">isiXhosa</option>
          <option value="st">Sesotho</option>
          <option value="af">Afrikaans</option>
        </select>
        <button class="share-btn" data-share>Share this red flag</button>
      </div>
    `;
    const textEl = el.querySelector("[data-lang-text]");
    const selectEl = el.querySelector("[data-lang-select]");
    const shareBtn = el.querySelector("[data-share]");

    selectEl.addEventListener("change", () => {
      textEl.textContent = lesson[selectEl.value];
    });

    shareBtn.addEventListener("click", async () => {
      const lang = selectEl.value;
      const card = `⚑ ${lesson.title} (${LANG_LABEL[lang]})\n\n${lesson[lang]}\n\nvia Qhaphela Red Flag Academy`;
      try {
        await navigator.clipboard.writeText(card);
        shareBtn.textContent = "Copied, paste anywhere";
        shareBtn.classList.add("done");
        setTimeout(() => {
          shareBtn.textContent = "Share this red flag";
          shareBtn.classList.remove("done");
        }, 2000);
      } catch (e) {
        // Clipboard permission can be denied by the browser; fail visibly
        // rather than silently, since there's no fallback UI to select the
        // text for the user in this MVP.
        shareBtn.textContent = "Copy failed, select text manually";
      }
    });

    root.appendChild(el);
  });
}

render();

// Theme shared with the panel/popup via chrome.storage.local.
chrome.storage.local.get(["qhaphela-theme"]).then((data) => {
  if (data["qhaphela-theme"] === "dark") {
    document.body.classList.add("dark");
    document.getElementById("theme-toggle").textContent = "☀";
  }
});
document.getElementById("theme-toggle").addEventListener("click", () => {
  const dark = document.body.classList.toggle("dark");
  document.getElementById("theme-toggle").textContent = dark ? "☀" : "☾";
  chrome.storage.local.set({ "qhaphela-theme": dark ? "dark" : "light" });
});
