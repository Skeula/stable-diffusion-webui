const fs = require('fs')
const path = require('path')

function flat (arr) {
   return arr.reduce(
      (acc,val) => Array.isArray(val) ? [...acc, ...flat(val)]
                 : val == null ? acc
                 : [...acc, val],
      [])
}

function flatMap (arr, act) {
    return flat(flat(arr).map(act))
}

function splitlist (str) {
    return typeof str === 'string' ? str.split(/\s*(?:,|，)\s*/) : [str]
}

function val (str) {
    return flatMap([str], _=>splitlist(_))
}

function maybe (value, acc) {
    return acc.split('.').reduce((acc, _) => typeof acc === 'object' && _ in acc ? acc[_] : undefined, value)
}

function readtxt (file) {
    return fs.readFileSync(file, 'utf8').split(/\n/).filter(_ => _ != '')
}

function readjson (file) {
    try {
        return JSON.parse(fs.readFileSync(file))
    } catch (ex) {
        console.error(`JSON parse failure in "${file}": ${ex.message}`)
        process.exit(1)
    }
}

for (const file of readtxt(process.argv[2])) {
    const name = path.basename(file, '.meta.json')
    const info = readjson(file)
    const isPairNeg = /-neg$/.test(name)
    const isClean = /x/.test(file)
    const isNeg = isPairNeg || isClean
    weight = maybe(info, 'settings.weight') || maybe(info, 'suggestion.weight')

    let re_extNet
    if (info.type === 'textual inversion') {
        let names = [name]
        for (const _ of (info.files||[])) {
            if (_.name) names.push(_.name)
        }
        re_name = names.map(_ => _.replace(/([|.?*{[^$])/g, '\\$1')).join('|')
        re_extNet = new RegExp('((?:' + re_name + ')|[(]+(?:' + re_name + ')(?::([^)]+))?([)]+))')
    } else {
        re_extNet = /(<[^:>]+:[^:>]+(?::([^>]+))?)>/
    }

    let prompt = []
    const prompt_todo = [val(maybe(info, 'settings.prompt'))]
    if (!isNeg) prompt_todo.push(val(info.trigger))
    for (let srcprompt of prompt_todo) {
        prompt = srcprompt.map(_ => {
            const match = _.match(re_extNet)
            if (match) {
                if (!weight && match[2]) weight = match[2]
                if (!weight && match[3]) {
                    weight = 1
                    for (const _ of 1..match[3].length) {
                       weight *= 1.1
                    }
                }
                return _.replace(re_extNet, '').trim()
            } else {
                return _
            }
        }).map(_ => _.replace(/^\s*,\s*|\s*,\s*$/g, '')).map(_ => _.trim()).filter(_ => _ !== '')
        if (prompt.length !== 0) break
    }

    let negative = []
    const negative_todo = [val(maybe(info, 'settings.negative_prompt'))]
    if (isNeg) negative_todo.push(val(info.trigger))
    for (let srcnegative of negative_todo) {
        negative = srcnegative.map(_ => {
            const match = _.match(re_extNet)
            if (match) {
                if (!weight && match[2]) weight = match[2]
                if (!weight && match[3]) {
                    weight = 1
                    for (const _ of 1..match[3].length) {
                       weight *= 1.1
                    }
                }
                return _.replace(re_extNet, '').trim()
            } else {
                return _
            }
        }).map(_ => _.replace(/^\s*,\s*|\s*,\s*$/g, '')).map(_ => _.trim()).filter(_ => _ !== '')
        if (negative.length !== 0) break
    }

    if (info.preview) {
        if (!weight && info.preview.resources) {
            for (const _ of info.preview.resources) {
                if (_.weight) {
                    weight = _.weight
                    break
                }
            }
        }
        if (!weight && info.preview.prompt) {
           for (const _ of val(info.preview.prompt)) {
               const match = _.match(re_extNet)
               if (match && match[2]) {
                   weight = match[2]
                   break
               }
           }
        }
    }
    
    // LOOK for negative embedding
    // and clean emoji in path

    if (info.type === 'lora') {
        type = "[L]"
        prompt = `<lora:${name}${weight?':'+weight:''}>${prompt}`
    } else if (info.type === 'hypernetwork') {
        type = "[H]"
        prompt = `<hypernet:${name}${weight?':'+weight:''}>${prompt}`
    } else if (info.type === 'textual inversion') {
        type = "[E]"
        prompt = `${weight?'('+name+':'+weight+')':name}${prompt.length?', '+prompt:''}`
        ;[ext] = info.files.filter(_ => _.type==='Model').map(_ => path.extname(_.filename))
        // if a -neg pair exists, include it
        if (fs.existsSync(path.dirname(file) + '/' + name + '-neg.meta.json')) {
            negative = `${weight?'('+name+'-neg:'+weight+')':name+'-neg'}${negative.length?', '+negative:''}`
        }
        // if we -are- a -neg and a postive version exists, skip
        if (isPairNeg && fs.existsSync(path.dirname(file) + '/' + name.replace('-neg', '') + '.meta.json')) {
            continue
            
        }
    }
    console.log(`"${type} ${name}","${prompt}","${negative}"`)
}
