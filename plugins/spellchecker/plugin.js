/** 
 * Modified by Justin Carlson, American Institute for Research.
 *
 *  Changes => Merged ckEditor plugin into the same file.
 *             Adding documentation to the existing framework
 *             Modify the webservice to call a different backend
 *             Eventually deprecate 
 *
 *   Major Components
 *     SpellChecker - Primary class for managing the spelling updates, clicks and popups
 *        Parser <= HtmlParser or TextParser - Parsing / Utility classes for actually 
 *        reading text and returning only the words (strips out punctuation and many other things)
 *        
 *     SuggestBox  - Provides the box that pops up on a left click to replace the word
 *
 *     WebService  - Provides the calls to the server to lookup misspelled word
 *       (Easy to override for test cases)
 *
 *     CKEditor.plugin.add('spellcheck') - Means of interaction with the event modes
 *       of CKEditor.  Very, very touchy.  Uses a SpellChecker instance attached to an 
 *       editor.
 *
 *  Contains findAndReplaceDOMText v 0.2 (License and info further in the plugin)
 */
/*
 * jQuery Spellchecker - v0.2.4
 * https://github.com/badsyntax/jquery-spellchecker
 * Copyright (c) 2012 Richard Willis; Licensed MIT
 */
(function(window) {
  /* Config
   *************************/
  var pluginName = 'spellchecker';

  /* Util
   *************************/
   if(!window.console){ //Help deal with IE lacking console except in debug modes.
     window.console = {
       log: function(){},
       error: function(){},
       warn: function(){},
       info: function(){}
     };
   }
   if(!Function.prototype.bind){ //More legacy IE support.
     Function.prototype.bind = function (oThis){
     if(typeof this !== "function"){
       // closest thing possible to the ECMAScript 5 internal IsCallable function
       throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
     }
   
     var aArgs = Array.prototype.slice.call(arguments, 1),
       fToBind = this,
       fNOP = function (){},
       fBound = function (){
         return fToBind.apply(this instanceof fNOP && oThis
                    ? this
                    : oThis,
                    aArgs.concat(Array.prototype.slice.call(arguments)));
       };
   
     fNOP.prototype = this.prototype;
     fBound.prototype = new fNOP();
     return fBound;
     };
   }

  /* Spellchecker (Main interface class, used by the plugin arch)
   *************************/
  var SpellChecker = function(config, editor) {
    this.editor = editor;
    this.setupWebService();

  };

  SpellChecker.prototype.setupWebService = function() { //Calls into BlackBox SpellCheck
    this.webservice = new SpellCheck(SpellCheckManager, this.editor.contentDom);
    this.webservice.clickWord = function(ev, node, word){
       var suggestions = SpellCheckManager.getSuggestions(word);
       var menuItems = [];

       // check if there are any word suggestions
       if (suggestions && suggestions.length > 0){
           for (var i = 0; i < suggestions.length; i++){
               var suggestion = suggestions[i];
               var obj = { node: node, word: word, replacement: suggestion }; // create menu item
               menuItems.push({
                   text: suggestion,
                   onclick: { fn: this.replaceWord.bind(this, node, word, suggestion), obj: obj, scope: this}
               });
           }
       }
       else{
           // create empty menu item
           // disabled: true // BUG #16817: ESC does not close Suggestion list menu if it has 'No Suggestion'
           menuItems.push({
               text: 'No suggestions'
           });
       }
       // get element XY
       var menuXY = YUD.getXY(node);
       menuXY = ContentManager.getEventXY(ev, menuXY); // include XY of iframe

       // add height of word offset
       var region = YAHOO.util.Region.getRegion(node);
       menuXY[1] += region.height;
       ContentManager.Menu.show(ev, menuItems, menuXY);
    };
  };

  /* Pubic API methods */
  SpellChecker.prototype.clickEvt = function(evt){
      if (evt.button == 0){ // check if what we clicked on was a misspelled word
          var el = YUE.getTarget(evt);
          if (YUD.hasClass(el, this.webservice.wordClassName)){
              var word = Util.Dom.getTextContent(el);
              this.webservice.clickWord(evt, el, word);
          }
      }
  };

  SpellChecker.prototype.check = function(text, callback) {
    this.webservice.check();
    this.editor.contentDom.onclick = this.clickEvt.bind(this);
  };

  SpellChecker.prototype.getSuggestions = function(word, callback) {
    this.webservice.getSuggestions(word, callback);
  };

  SpellChecker.prototype.destroy = function() {
  };

  /* Event handlers */
  window.SpellChecker = SpellChecker;



CKEDITOR.plugins.add('spellchecker', {
  requires: 'richcombo',
  config: {
    lang: 'en',
    parser: 'html'
  },
  init: function( editor ) {

    var t = this;
    var pluginName = 'spellchecker';

    editor.spell = this;
    editor.addCommand(pluginName, {
      canUndo: false,
      readOnly: 1,
      exec: function() {
        t.toggle(editor);
      }
    });

    editor.ui.addButton('SpellChecker', {
      label: 'SpellCheck',
      icon: 'spellchecker',
      command: pluginName,
      toolbar: 'spellchecker,10'
    });


    var lookup = {
      ESN: 'Español',
      ENU: 'English'
    };
    var langs = window.ContentManager ? ContentManager.getAccommodationProperties().getLanguages() : ['ENU', 'ESN'];

    if(langs.length > 1){
      editor.ui.addRichCombo('Languages', {
        toolbar: 'spellchecker,20',
        label: 'English',
        value: 'English',
        onClick: function(value){
            this.setValue(value);
            this.label = value;
            if(value != 'English'){ //Set to spanish for creating the Spellcheck service
              t.config.lang = 'esn'; //Legacy spellchecker used en, or esn, rather than ENU, ESN....
            }
        },
        panel: {
          css: [ CKEDITOR.skin.getPath( 'editor' ) ].concat( editor.config.contentsCss ),
          multiSelect: false,
          attributes: {'aria-label': 'Spellcheck language'}
        },
        init: function(){
          this.startGroup('Language');
          for(var i=0; i<langs.length; ++i){
            if(lookup[langs[i]]){
              this.add(lookup[langs[i]]);
            }
          }
          this.commit();
        }
      });
    }
  },
  create: function() {
    this.editor.setReadOnly(true);
    this.editor.commands.spellchecker.toggleState();

    if(this.createSpellchecker()){ //Not defined outside of blackbox
      this.spellchecker.check();
    }else{
      this.editor.setReadOnly(false);
      this.editor.commands.spellchecker.toggleState();
    }
  },

  destroy: function() {
    if (!this.spellchecker){return;}
    
    this.spellchecker.webservice.done();
    this.spellchecker.destroy();
    this.spellchecker = null;
    this.editor.setReadOnly(false);
    this.editor.commands.spellchecker.toggleState();
    if(YAHOO.env.ua.gecko){
      this.firefoxFocusHack();
    }
  },
  firefoxFocusHack: function(){
    //This seems totally broken, because it IS, but READ
    // https://bugz.airws.org/default.asp?72456 before changing
    try{ 
      var hack = document.createElement('input');
      hack.type = 'text';
      this.editor.contentDom.appendChild(hack);
      hack.focus();
      hack.parentNode.removeChild(hack);
      this.editor.focus();
    }catch(e){
      console.error("Failed to manage the focus events.", e);
    }
  },
  toggle: function(editor) {
    this.editor = editor;
    if (!this.spellchecker) {
      this.create();
    } else {
      this.destroy();
    }
  },
  createSpellchecker: function() {
    if(window.SpellCheck){
      this.spellchecker = new SpellChecker(this.config, this.editor);
    }else{
      console.warn("Spellcheck service was not defined, would have used cfg, editor", this.config, this.editor);
    }
    return this.spellchecker;
  }
});

})(this);
