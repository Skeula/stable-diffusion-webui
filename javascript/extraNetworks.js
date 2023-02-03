function refilter (tabname, searchTerms) {
    searchTerms = searchTerms.toLowerCase()
    for (const extraType of gradioApp().querySelectorAll('#'+tabname+'_extra_tabs div.extra-network-cards')) {
        const cards = []
        for (const elem of extraType.children) {
            const nameElem = elem.querySelector('.name')
            const searchElem = elem.querySelector('.search_term')
            if (!nameElem || !searchElem) continue
            const text = nameElem.textContent.toLowerCase() + " " + searchElem.textContent.toLowerCase()
            cards.push({elem,text})
        }
        for (const {elem,text} of cards) {
            let matched = true
            // in our world, search terms are a / separated list of search terms
            // if a term does not exist at all in the origin then we ignore
            // it, which does mean that if you start typing the results will get shorter and
            // shorter and reset to everything which ok, weird, but acceptable
            for (let term of searchTerms.split('/')) {
                term = term.trim()
                // a term is special if it starts with $ or that are exclusively non-ascii-letter-chars
                // "non-ascii" is detected by looking for any \w class char that's not immediately followed
                // by a zero-width-joiner
                const termIsSpecial = term[0]==='$' || !(/\w(?!️)/.test(term))
                const termInAnyCard = cards.some(_ => _.text.includes(term))
                termInThisCard = text.includes(term)
                if (termInThisCard) continue
                if (termIsSpecial && !termInAnyCard) continue
                matched = false
                break
            }
            elem.style.display = matched ? '' : 'none'
        }
    }
}

function setupExtraNetworksForTab(tabname){
    gradioApp().querySelector('#'+tabname+'_extra_tabs').classList.add('extra-networks')

    const tabs = gradioApp().querySelector('#'+tabname+'_extra_tabs > div')
    const search = gradioApp().querySelector('#'+tabname+'_extra_search textarea')
    const refresh = gradioApp().getElementById(tabname+'_extra_refresh')

    search.value = '1️⃣/🎏'
    search.classList.add('search')
    tabs.appendChild(search)
    tabs.appendChild(refresh)

    search.addEventListener("input", () => refilter(tabname, search.value))
    
    refilter(tabname, search.value)
}

const activePromptTextarea = {};

function setupExtraNetworks(){
    setupExtraNetworksForTab('txt2img')
    setupExtraNetworksForTab('img2img')

    function registerPrompt(tabname, id){
        const textarea = gradioApp().querySelector("#" + id + " > label > textarea");

        if (! activePromptTextarea[tabname]){
            activePromptTextarea[tabname] = textarea
        }

		textarea.addEventListener("focus", function(){
            activePromptTextarea[tabname] = textarea;
		});
    }

    registerPrompt('txt2img', 'txt2img_prompt')
    registerPrompt('txt2img', 'txt2img_neg_prompt')
    registerPrompt('img2img', 'img2img_prompt')
    registerPrompt('img2img', 'img2img_neg_prompt')
}

onUiLoaded(setupExtraNetworks)

const re_extranet   = /<([^:]+:[^:]+):[\d\.]+>/;
const re_extranet_g = /\s+<([^:]+:[^:]+):[\d\.]+>/g;

function quotemeta (txt) {
  if (!txt) return txt
  return txt.replace(/([$^\[.?{(])/g,'\\$1')
}
function tryRemoveDuplicate(textarea, text) {
    const match_text = new RegExp('(^|, +)' + quotemeta(text) + '((?=, )|$)')
    if (!match_text.test(textarea.value)) return false
    textarea.value = textarea.value.replace(match_text, '')
    return true
}

const re_extra_type = '[^:>]+'
const re_extra_name = '[^:>]+'
const re_extra_weight = '[-+]?(?:\\d*[.]\\d+|\\d+[.]\\d*|\\d+)'
const has_extranet = new RegExp(`<(${re_extra_type}):(${re_extra_name})(?::(${re_extra_weight}))?>`)
function tryRemoveExtraNet(textarea, text){
    // if it's not an extranet click, eg <type:name:weight> or <type:name>, then its a TI
    // TIs are not removed by default
    const extra = text.match(has_extranet)
    if (!extra) return false

    let [, type, name] = extra
    const re_this_type = quotemeta(type)
    let re_this_name
    if (type == 'checkpoint') {
        // checkpoint entries have hashes, but that shouldn't stop us from matching
        name = name.replace(/ \[[^\]]+\]$/, '')
        re_this_name = quotemeta(name) + '[^:>]*'
    } else {
        re_this_name = quotemeta(name)
    }
   
    const is_this = new RegExp(` ?<${re_this_type}:${re_this_name}(?::${re_extra_weight})?>`)
    if (is_this.test(textarea.value)) {
        textarea.value = textarea.value.replace(is_this, '')
        return true
    } else if (type == 'checkpoint') {
        // if it was a checkpoint AND it wasn't toggling an existing entry then
        // let's remove any other checkpoints, since more than one makes no sense
        const is_this_type = new RegExp(` ?<${re_this_type}:${re_extra_name}(?::${re_extra_weight})?>`, 'g')
        textarea.value = textarea.value.replace(is_this_type, '')
        // we don't return true, 'cause we still want to add the checkpoint the user selected
    }
}

function cardClicked(tabname, textToAdd, allowNegativePrompt){
    let updates = []
    if (Array.isArray(textToAdd)) {
        const [addPrompt,addNegativePrompt] = textToAdd
        if (addPrompt) {
          updates.push({
              textarea: gradioApp().querySelector(`#${tabname}_prompt > label > textarea`),
              add: addPrompt
          })
        }
        if (addNegativePrompt) {
          updates.push({
              textarea: gradioApp().querySelector(`#${tabname}_neg_prompt > label > textarea`),
              add: addNegativePrompt
          })
        }
    } else {
        textarea = allowNegativePrompt
                 ? activePromptTextarea[tabname]
                 : gradioApp().querySelector(`#${tabname}_prompt > label > textarea`)
        updates.push({ textarea, add: textToAdd })
    }
    for (const update of updates) {
        if (!update.add) continue

        if (!(tryRemoveDuplicate(update.textarea, update.add) || tryRemoveExtraNet(update.textarea, update.add))) {
            spacer = opts.extra_networks_add_text_separator
            update.textarea.value = update.textarea.value == ''
                                  ? update.add
                                  : update.textarea.value + spacer + update.add
        }
        updateInput(update.textarea)
    }

}

function saveCardPreview(event, tabname, filename){
    const textarea = gradioApp().querySelector("#" + tabname + '_preview_filename  > label > textarea')
    const button = gradioApp().getElementById(tabname + '_save_preview')

    textarea.value = filename
    updateInput(textarea)

    button.click()

    event.stopPropagation()
    event.preventDefault()
}

const emoji_one = '1️⃣'
const emoji_two = '2️⃣'
const emoji_sfw = '🎏'
const emoji_nsfw = '🎭'
const is_sdver = new RegExp('^(' + [emoji_one,emoji_two].join('|') + ')$')
const is_safety = new RegExp('^(' + [emoji_sfw,emoji_nsfw].join('|') + ')$')

function extraNetworksSearchButton(tabs_id, event){
    const searchTextarea = gradioApp().querySelector("#" + tabs_id + ' > div > textarea')
    let search = searchTextarea.value.trim().split('/')
    const button = event.target
    const new_term = button.textContent.trim()

    // Clicking all clears the search
    if (button.classList.contains("search-all")) {
      search = []
    // Clicking a term that's already in our search
    } else if (search.some(_ => _ === new_term)) {
      search = search.filter(_ => _ !== new_term)
    } else {
      // Clicking on a filter card updates the search based on the single token being clicked on
      // safety and version clicks replace existing elements of their type and failing that, are
      // prepended
      for (const is_prefix of [is_sdver, is_safety]) {
        if (is_prefix.test(new_term)) {
            const match_loc = search.map((_,ii) => is_prefix.test(_) ? ii : -1).filter(_ => _ != -1)
            if (match_loc.length) {
                search[match_loc[0]] = new_term
            } else {
                // if the first elem is a version (which means we are not) and
                // our term doesn't exist yet, inject said term after it
                if (is_sdver.test(search[0])) {
                   search.splice(1,0,new_term)
                } else {
                   search.unshift(new_term)
                }
            }
            break
        }
        search = search.filter(_ => is_prefix.test(_))
        search.push(new_term)
      }
    }
    searchTextarea.value = search.join('/')
    updateInput(searchTextarea)
}

var globalPopup = null;
var globalPopupInner = null;
function popup(contents){
    if(! globalPopup){
        globalPopup = document.createElement('div')
        globalPopup.onclick = function(){ globalPopup.style.display = "none"; };
        globalPopup.classList.add('global-popup');

        var close = document.createElement('div')
        close.classList.add('global-popup-close');
        close.onclick = function(){ globalPopup.style.display = "none"; };
        close.title = "Close";
        globalPopup.appendChild(close)

        globalPopupInner = document.createElement('div')
        globalPopupInner.onclick = function(event){ event.stopPropagation(); return false; };
        globalPopupInner.classList.add('global-popup-inner');
        globalPopup.appendChild(globalPopupInner)

        gradioApp().appendChild(globalPopup);
    }

    globalPopupInner.innerHTML = '';
    globalPopupInner.appendChild(contents);

    globalPopup.style.display = "flex";
}

function extraNetworksShowMetadata(text){
    elem = document.createElement('pre')
    elem.classList.add('popup-metadata');
    elem.textContent = text;

    popup(elem);
}

function requestGet(url, data, handler, errorHandler){
    var xhr = new XMLHttpRequest();
    var args = Object.keys(data).map(function(k){ return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]) }).join('&')
    xhr.open("GET", url + "?" + args, true);

    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                try {
                    var js = JSON.parse(xhr.responseText);
                    handler(js)
                } catch (error) {
                    console.error(error);
                    errorHandler()
                }
            } else{
                errorHandler()
            }
        }
    };
    var js = JSON.stringify(data);
    xhr.send(js);
}

function extraNetworksRequestMetadata(event, extraPage, cardName){
    showError = function(){ extraNetworksShowMetadata("there was an error getting metadata"); }

    requestGet("./sd_extra_networks/metadata", {"page": extraPage, "item": cardName}, function(data){
        if(data && data.metadata){
            extraNetworksShowMetadata(data.metadata)
        } else{
            showError()
        }
    }, showError)

    event.stopPropagation()
}
