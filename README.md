# NanoBB (Nano BeepBoop)
NanoBB is a dynamically typed, javascript transpiled, easily-embeddable, web-based programming language. It is designed with an intuitive DOM API in mind and a safe mode to allow for people to program from the browser without destroying the page!

![NanoBB Logo](/NanoBB-Logo.png)
## How To Use?
First, make sure you include the "nanobb.js" file in your page directory and run it in the header as follows:
```html
<script src="NanoBB.js"></script>
```
Next you can compile code by making a new instance. It automatically compiles the string you pass into the constructor. You can also recompile with the "compile" function. You also can pass an "io" parameter which is just a function which can be accessed and called by the code via the "io_req" function.
```js
try {
  // You can compile manually with "inst.compile();"
  // The "esoteric" flag implements joke values into the code
  let inst = new NanoBB_instance("(= main []{})",()=>{},{esoteric: true});
}catch(err){
  // Alert compile error
  alert(err);
}

// When you execute the code you can include a flag to alert you to an error!
inst.exec({alert: true});
```
