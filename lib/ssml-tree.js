const SOFT_LIMIT = 1000
const HARD_LIMIT = 1500

const { SSMLParseError } = require('./errors')

/**
 * @typedef {Object} TreeNode Tree node that can contain plain text or SSML tag.
 * @property {string} type Type of node: `TEXT` or SSML tag like `prosody`, `speak`.
 * @property {string} value Text value for `TEXT` node or attributes for SSML tag.
 * @property {TreeNode} parentNode Pointer to a parent node.
 */

/**
 * Creates a tree data structure from SSML text.
 * @class
 */
class SSMLParseTree {
    /**
     * Set default character limits.
     * Initialize tree.
     *
     * @param {number} hardLimit
     * @param {number} softLimit
     */
    constructor(hardLimit, softLimit) {
        /** @private */
        this._root = {
            parentNode: null,
            type: 'root',
        }
        /** @private */
        this._hardLimit = hardLimit
        /** @private */
        this._softLimit = softLimit
    }

    /**
     * Adds a new tree node as a parentNode child.
     *
     * @param {TreeNode} parentNode
     * @param {TreeNode} newNode
     * @private
     */
    _addNode(parentNode, newNode) {
        if (parentNode.children) {
            parentNode.children.push(newNode)
        } else {
            parentNode.children = [newNode]
        }
    }

    /**
     * Creates tree data structure from SSML text.
     * @param {string} ssml String containing text with SSML tags.
     */
    buildTree(ssml) {
        // remove extra space if needed
        ssml = ssml.trim(ssml)

        let text = ''
        let textHasStarted = false
        let currentNode = this._root

        for (let i = 0, len = ssml.length; i < len; i++) {
            // check if the char is a plain text or SSML tag
            if (ssml[i] === '<') {
                /*
                 * 1. SSML tag
                 */

                // check if the text was already started - finish it and add to the parentNode
                if (textHasStarted) {
                    textHasStarted = false

                    const newNode = {
                        parentNode: currentNode,
                        type: 'TEXT',
                        value: text,
                    }

                    this._addNode(currentNode, newNode)
                }

                // type and value/attributes of parsed SSML tag
                let type = ''
                let value = '' // can be blank, like <tag /> or <tag></tag>

                let isEndTag = false // flag for end tag (</tag>)
                let isEmptyTag = false // flag for empty tag (<tag />)

                // start from next char
                let j = i + 1

                // check if it is an end tag (no value)
                if (ssml[j] === '/') {
                    isEndTag = true

                    // start from the next char
                    j++

                    // parse only type
                    while (ssml[j] !== '>') {
                        type += ssml[j]
                        j++
                    }
                } else {
                    /*
                     *  1. Parse type unless:
                     *  ' ' - value is coming
                     *  '>' - is start tag marker
                     *  '/' - is empty tag marker
                     */
                    while (ssml[j] !== ' ' && ssml[j] !== '>' && ssml[j] !== '/') {
                        type += ssml[j]
                        j++
                    }

                    // 2. Parse value
                    while (true) {
                        if (ssml[j] !== '>') {
                            // A. value continues -> accumulate value
                            value += ssml[j]
                        } else if (ssml[j - 1] === '/') {
                            // B. empty tag <tag />
                            isEmptyTag = true

                            // remove last `/` char from value
                            if (value.length !== 0) value = value.slice(0, value.length - 1)
                            break
                        } else {
                            // C. end tag </tag>
                            break
                        }
                        j++
                    }
                }

                /*
                 * Process parsing results
                 */

                if (!isEndTag) {
                    const newLeaf = {
                        parentNode: currentNode,
                        type,
                        value,
                    }
                    this._addNode(currentNode, newLeaf)

                    if (!isEmptyTag) {
                        // Not an empty tag => can have other children, then keep it active
                        currentNode = newLeaf
                    }
                } else if (isEmptyTag) {
                    // is an end tag + empty end tag
                    const newLeaf = {
                        parentNode: currentNode,
                        type,
                        value,
                    }
                    this._addNode(currentNode, newLeaf)
                } else {
                    // is an end tag </tag>
                    // close current tag = no more children
                    
                    // sanity check
                    if (currentNode.type !== type) {
                        const msg = `Incorrect SSML: ${type} !== ${currentNode.type}`
                        throw new SSMLParseError(msg)
                    }
                    currentNode = currentNode.parentNode
                }

                // skip processed chars for the next iteration
                i = j
            } else {
                /*
                 * 2. Plain text
                 */
                if (!textHasStarted) {
                    textHasStarted = true
                    text = ''
                }

                // accumulate characters
                text += ssml[i]
            }
        }

        return this._root
    }
}

module.exports = new SSMLParseTree(HARD_LIMIT, SOFT_LIMIT)
